const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const moment = require('moment');
const socket = require('socket.io');
const socketChat = require('./socketChat');
const User = require('./db/models/users');
const Listing = require('./db/models/listing');
const Stay = require('./db/models/stays');
const { Msg, Chat } = require('./db/models/chat');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary');
const cloudConfig = require('./cloudinary/config.js');
const multer = require('multer');
const nodemailer = require('nodemailer');
const upload = multer({dest: './uploads/'});
const debug = process.env.DEBUG || true;

// This is the shape of the object from the config file which is gitignored
// const cloudConfig = {
//   cloud_name: 'top-hat',
//   api_key: 'API_KEY',
//   api_secret: 'API_SECRET'
// };

cloudinary.config(cloudConfig);
const app = express();
app.use(express.static((__dirname + '/src/public')));
app.use(bodyParser.json());

const JWT_KEY = 'who let the dogs in?!';
const EMAIL_AUTH = {user: 'sitnpawsio@gmail.com', pass: 'sitnpaws13'};

//============= AUTHENTICATION HELPER =============\\
const jwtAuth = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) { res.status(401).send(); return; }
  try { // token validation
    req.tokenPayload = jwt.verify(token, JWT_KEY);
    next();
  } catch(err) {
    res.status(401).send();
    return;
  }
};

//============= EMAIL NOTIFICATION HELPER =============\\
const sendStayRequestMail = (hostEmail, guestEmail, startDate, endDate) => {
  const transporter = nodemailer.createTransport({service: 'gmail', auth: EMAIL_AUTH});
  const mailOptions = {
    to: hostEmail,
    subject: 'Hi from Sit-n-Paws! A friend wants to stay at your house from ' +
              moment(startDate).format('LL') + ' to ' + moment(endDate).format('LL'),
    text: 'Email the pet owner @ ' + guestEmail +
    ' to discuss specifics, and login to approve or reject the stay. Please respond within 24 hours!',
  };
  transporter.sendMail(mailOptions).then((info) => {
    if (debug) { console.log('Nodemailer details: ', info); }
  });
}

//handles log in information in the db, creates jwt
app.post('/login', (req, res) => {
  var email = req.body.email;
  var password = req.body.password;
  User.findOne({ email: email })
     .exec((err, found) => {
      if (err) {
        throw err;
        console.log('error');
      } else {
        if (found) {
          found.comparePassword(password).then(match => {
            if (match) {
              let payload = {
                email: found.email,
                name: found.name
              };
              let token = jwt.sign(payload, JWT_KEY, {
                expiresIn: '1h'
              });
              res.json({
                success: true,
                email: found.email,
                name: found.name,
                token: token
              });
            }
          })
        } else {
          res.send(JSON.stringify({
            success: false,
            error: 'Invalid Login/Password'
          }));
        }
      }
    })
});

//handles new user creations in db
app.post('/signup', (req, res) => {
  var name = req.body.name;
  var password = req.body.password;
  var email = req.body.email;
  User.findOne({ email: email })
    .exec((err, found) => {
      if (err) {
        throw err;
        console.log('error');
      }
      if (found) {
        res.send(JSON.stringify({
          success: false,
          error: 'User already exists!',
        }));
      } else {
        User.create({
          password: password,
          email: email,
          name: name,
          phone: '',
          address: ''
        })
        .then((newUser) => {
          let payload = {
            name: newUser.name,
            email: newUser.email
          };
          let token = jwt.sign(payload, JWT_KEY, {
            expiresIn: '1h'
          });
          res.json({
            success: true,
            name: newUser.name,
            email: newUser.email,
            token: token
          });
        })
        .catch((err) => {
          console.log(err);
        })
      }
    })
});

//handles fetching profiles in db
app.get('/api/profile', jwtAuth, (req, res) => {
  let email = req.tokenPayload.email;

  User.findOne({email: email}, function(err, user) {
    if(err) {
      console.log(err);
    } else {
      res.json(user);
    }
  })
});

//handles updating profiles in db
app.put('/api/profile', jwtAuth, (req, res) => {
  let email = req.tokenPayload.email;
  let updateProfile = {
    name: req.body.name,
    phone: req.body.phone,
    address: req.body.address
  };
  User.findOneAndUpdate({email: email}, updateProfile, { new: true}).then((updated) => {
    let payload = { name: updated.name, email: updated.email };
    let token = jwt.sign(payload, JWT_KEY, { expiresIn: '1h' });
    res.json({
      success: true,
      name: updated.name,
      email: updated.email,
      token: token
    });
  }).catch((err) => { res.json('error: ', err); });
});

//Check post listing for uploaded files and stores in req.files
let listingsUpload = upload.fields([{
  name: 'hostPictures',
  maxCount: 1
}, {
  name: 'homePictures',
  maxCount: 1
}]);

//handles posts for listings in db
app.post('/listings', listingsUpload, (req, res, next) => {
  // The 'next()' is important as it ensures the images get sent
  // to the Cloudinary servers after the Listing and responses are
  // sent to the client, making the upload responsive
  Listing.findOne({email: req.body.email})
  .then((found) => {
    if (found) {
      // update Listing
      Listing.update(req.body);
      res.json({success: true, message: 'Thank you, your listing has been successfully updated!', listing: found});
      next();
    } else {
      // Create new Listing and save in database
      var newListing = new Listing({
        name: req.body.name,
        email: req.body.email,
        zipcode: req.body.zipcode,
        dogSizePreference: req.body.dogSizePreference,
        dogBreedPreference: req.body.dogBreedPreference,
        // dogTemperamentPreference: req.body.dogTemperamentPreference,
        dogActivityPreference: req.body.dogActivityPreference,
        homeAttributes: req.body.homeAttributes,
        hostPictures: 'Image is being uploaded...',
        homePictures: 'Image is being uploaded...',
        cost: req.body.cost
      });
      newListing.save((err, host) => {
        if (err) {
          res.json({success: false, message: err});
        } else {
          res.json({success: true, message: 'Thank you, your listing has been successfully saved!', listing: host});
        }
        next();
      });
    }
  }).catch((err) => {
    res.json({success: false, message: err});
    next();
  });
}, (req, res) => {
  // Sends files to the Cloudinary servers and updates entries in the database
  if (req.files.hostPictures) {
    console.log('Send to cloudinary!', req.files.hostPictures[0].path);
    cloudinary.v2.uploader.upload(req.files.hostPictures[0].path, (err, result) => {
      if(err) {
        console.log('Cloudinary error: ', err);
      }
      console.log('Host Picture url: ', result.url)
      Listing.findOneAndUpdate({name: req.body.name}, {hostPictures: result.url}, (err, found) => {
        if (err) {
          console.log(err);
        }
        console.log('Updated Host Pictures: ', found);
      });
    });
  }
  if (req.files.homePictures) {
    console.log('Send to cloudinary!', req.files.homePictures[0].path);
    cloudinary.v2.uploader.upload(req.files.homePictures[0].path, (err, result) => {
      if (err) {
        console.log('Cloudinary error: ', err);
      }
      console.log('Home Picture url: ', result.url);
      Listing.findOneAndUpdate({name: req.body.name}, {homePictures: result.url}, (err, found) => {
        if (err) {
          console.log(err);
        }
        console.log('Updated Home Pictures: ', found)
      });
    });
  }
});

//handles getting all listings that exist
app.get('/listings', (req, res) => {
  Listing.find({})
    .exec((err, listings) => {
      if (err) {
        console.log('error');
      } else {
        res.send(listings);
      }
    })
});

//handles getting listings by zipcode from search
app.get('/listings/:zipcode', (req, res) => {
  var zipcode = req.params.zipcode;
  Listing.find({ "$where": `function() { return this.zipcode.toString().match(/${zipcode}/) !== null; }`})
    .exec((err, listings) => {
      if (err) {
        console.log(err);
      } else {
        res.send(listings);
        }
      })
});

app.get('/api/stays', jwtAuth, (req, res) => {
  console.log('request received...');
  const { email: userEmail } = req.tokenPayload;
  User.findOne({email: userEmail}).then(user => {
    if (!user) {
      return res.status(400).send('User not found');
    } else {
      const userId = user._id;
      const hostStays = Stay.find({hostId: ObjectId(userId)}).populate('listing', 'name zipcode', 'Listing').exec();
      const guestStays = Stay.find({guestId: ObjectId(userId)}).populate('listing', 'name zipcode', 'Listing').exec();
      return Promise.all([hostStays, guestStays]).then(([hostStays, guestStays]) => {
        let stays = [];
        hostStays.forEach(stay => stays.push(Object.assign({role: 'host'}, stay.toObject())));
        guestStays.forEach(stay => stays.push(Object.assign({role: 'guest'}, stay.toObject())));
        res.status(200).json(stays);
      });
    }
  }).catch(err => {
    console.log('Server error: ', err);
    res.status(500).send('Oops! Server error.');
  });
});

app.post('/api/stays', jwtAuth, (req, res) => {
  const { email: guestEmail } = req.tokenPayload;
  const { listingId, startDate, endDate } = req.body;
  if (!listingId || !startDate || !endDate ) { res.status(400).send('bad request'); return; }
  let hostEmail = '';
  let listing = Listing.findById(listingId).exec();
  let guest = User.findOne({email: guestEmail}).exec();
  const newStay = Promise.all([listing, guest]).then(([listing, guest]) => {
    if (!listing || !guest) {
      return res.status(400).send('Listing or guest not found.');
    } else {
      const days = Math.max(moment(endDate).diff(moment(startDate), 'days'), 1);
      hostEmail = listing.email;
      let newStay = new Stay({
        listing: listingId,
        hostId: listing.userId,
        guestId: guest._id,
        startDate: startDate,
        endDate: endDate,
        status: 'pending',
        pricePer: listing.cost,
        totalPrice: Math.floor(listing.cost*(days)),
      });
      return newStay.save();
    }
  }).then(stay => {
    return new Chat({stay: stay._id, host: stay.hostId, guest: stay.guestId }).save();
  }).then(chat => {
    if (hostEmail) { sendStayRequestMail(hostEmail, guestEmail, startDate, endDate); }
    res.status(201).json({message: 'stay created', stayId: chat.stay});
  }).catch(err => {
    console.log('Server error: ', err);
    res.status(500).send('Oops! Server error.');
  });
});

//TODO: send email notifications on stay update
app.put('/api/stay/cancel/:stayId', jwtAuth, (req, res) => {
  Stay.findById(req.params.stayId).exec().then(stay => {
    if (!stay) { throw new Error('Stay not found'); }
    if (stay.status === 'closed') { throw new Error('Cannot modify a closed stay'); }
    if (stay.status === 'rejected') { throw new Error('Cannot cancel a rejected stay'); }
    return stay.update({status: 'cancelled'}).exec();
  }).then(() => res.status(200).json({stayId: req.params.stayId}))
    .catch(err => res.status(400).send(err.message));
});

app.put('/api/stay/approve/:stayId', jwtAuth, (req, res) => {
  const stayId = req.params.stayId;
  const user = User.findOne({email: req.tokenPayload.email}).exec();
  const stay = Stay.findById(stayId).exec();
  Promise.all([user, stay]).then(([user, stay]) => {
    if (!stay) { throw new Error('Stay not found'); }
    if (!user) { throw new Error('User not found'); }
    if (stay.status === 'closed') { throw new Error('Cannot modify a closed stay'); }
    if (!stay.hostId.equals(user._id)) { throw new Error('Only host may approve or reject a stay'); }
    return stay.update({status: 'approved'}).exec();
  }).then(() => res.status(200).json({stayId: req.params.stayId}))
    .catch(err => res.status(400).send(err.message));
});

app.put('/api/stay/reject/:stayId', jwtAuth, (req, res) => {
  const stayId = req.params.stayId;
  const user = User.findOne({email: req.tokenPayload.email}).exec();
  const stay = Stay.findById(stayId).exec();
  Promise.all([user, stay]).then(([user, stay]) => {
    if (!stay) { throw new Error('Stay not found'); }
    if (!user) { throw new Error('User not found'); }
    if (stay.status === 'closed' || stay.status === 'approved') {
      throw new Error('Cannot reject an approved or closed stay');
    }
    if (!stay.hostId.equals(user._id)) { throw new Error('Only host may approve or reject a stay'); }
    return stay.update({status: 'rejected'}).exec();
  }).then(() => res.status(200).json({stayId: req.params.stayId}))
    .catch(err => res.status(400).send(err.message));
});

app.get('/api/messages/:stayId', jwtAuth, (req, res) => {
  let userId;
  const user = User.findOne({email: req.tokenPayload.email}).exec().then(user => {
    if (!user) { throw new Error('User not found'); }
    userId = user._id;
  }).then(() => Stay.findById(req.params.stayId).exec()).then(stay => {
    if (!(userId.equals(stay.hostId) || userId.equals(stay.guestId))) {
      throw new Error('Only host or guest may participate in chat');
    }
    return Chat.findOne({stay: req.params.stayId}).exec();
  }).then(chat => {
    const msg = Msg.find({chatId: chat._id}).sort('-createdAt').limit(10)
      .populate('user', '_id name').exec();
    msg.then(msgs => {
      res.status(200).json(msgs);
    });
  }).catch(err => res.status(400).send(err.message));
});

app.get('/api/chat/:stayId', jwtAuth, (req, res) => {
  let user = req.tokenPayload;
  User.findOne({email: req.tokenPayload.email}).exec().then(foundUser => {
    if (!foundUser) { throw new Error('User not found'); }
    user.id = foundUser._id;
  }).then(() => Stay.findById(req.params.stayId).exec()).then(stay => {
    if (!(user.id.equals(stay.hostId) || user.id.equals(stay.guestId))) {
      throw new Error('Only host or guest may participate in chat');
    }
    return Chat.findOne({stay: req.params.stayId}).exec();
  }).then(chat => {
    let resp = { user: {id: user.id, name: user.name }, chatId: chat._id};
    if (user.id.equals(chat.host)) { // user is host
      return User.findById(chat.guest).then(guest => {
        resp.user.role = 'host';
        resp.other = {id: guest._id, name: guest.name, role: 'guest'};
        res.status(200).json(resp);
      });
    } else if (user.id.equals(chat.guest)) { // user is guest
      return User.findById(chat.host).then(host => {
        resp.user.role = 'guest';
        resp.other = {id: host._id, name: host.name, role: 'host'};
        res.status(200).json(resp);
      });
    }
    res.status(200).json(resp);
  }).catch(err => res.status(400).send(err.message));
});

app.post('/api/messages/:stayId', jwtAuth, (req, res) => {
  const user = User.findOne({email: req.tokenPayload.email}).exec();
  const chat = Chat.findOne({stay: req.params.stayId}).exec();
  Promise.all([user, chat]).then(([user, chat]) => {
    if (!user) { throw new Error('User not found'); }
    if (!chat) { throw new Error('Chat not found'); }
    if (!(user._id.equals(chat.guest) || user._id.equals(chat.host))) {
      throw new Error('Only host or guest may participate in chat');
    }
    let newMsg = new Msg({ text: req.body.text, user: user._id, chatId: chat._id});
    return newMsg.save();
  }).then(() => {
    res.status(201).send('Message created');
  }).catch(err => res.status(400).send(err.message));
});

app.get('*', (req, res) => {
  res.sendFile(__dirname + '/src/public/index.html');
})

const server = app.listen(3000, () => {
  console.log('Listening on localhost:3000');
});

const io = socket(server);
socketChat(io);

module.exports = app;
