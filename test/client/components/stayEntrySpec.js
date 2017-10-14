import React from 'react';
import { expect } from 'chai';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { shallow, mount, render } from 'enzyme';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import getMuiTheme from 'material-ui/styles/getMuiTheme'
import Component from '../../../src/client/components/stayEntry.js';
import darkBaseTheme from 'material-ui/styles/baseThemes/darkBaseTheme';
import propTypes from 'prop-types';

// AJAX testing
import sinon from 'sinon';
import axios from 'axios';
import moxios from 'moxios';


configure({ adapter: new Adapter() });

/*


const stay = {
  "_id": "2340k728234jjf87",
  "role": 'guest',
  "listingId": "3cv45765nb75467",
  "guestId": "3vg5980u34cvg5",
  "hostId": "3vg598ertuciyu",
  "guestName": "Brian Griffin",
  "startDate": "2016-05-18T16:00:00Z",
  "endDate": "2016-05-18T16:00:00Z",
  "status": "pending",
  "pricePer": 33.99,
  "totalPrice": 76.77
};

*/

const listing = {
  _id: "59e10080705f9771fe252800",
  name: "Niels Larson",
  zipcode: 94110
};

const stay = {
      _id: "59e114d6ff7e2871f3285c63",
      endDate: "2017-10-19T07:00:00.000Z",
      guestId: "59e10105ff7e2871f3285c48",
      hostId: "59e10080705f9771fe2527fe",
      listing: listing,
      pricePer: 55,
      role: "guest",
      startDate: "2017-10-16T07:00:00.000Z",
      status: "pending",
      totalPrice: 165
};


//.render(Component, {muiTheme: getMuiTheme()})

const customTheme = {
  palette: {
  }
};

const muiTheme = getMuiTheme(customTheme);

var wrapComponent = function() {
  const props = {
    stay: stay
  };
  //wrapper.setState({status: this.props.stay.status});
  return shallow(
      <Component {...props} />, {
        context: {muiTheme},
        childContextTypes: {muiTheme: propTypes.object}
      }
  );
};

/*

var wrapComponent = function() {
  const component = mount(<MuiThemeProvider muiTheme={getMuiTheme()}><Component stay={stay} /></MuiThemeProvider>);
  return component.children();
};


*/



describe('<stayEntry />', () => {
  it('renders as a div', () => {
    const wrapper = wrapComponent();
    expect(wrapper.type()).to.equal('div');
  });

  it('renders with CardHeader element', () => {
    const wrapper = wrapComponent();
    expect(wrapper.find('CardHeader')).to.have.length(1);
  });

  it('renders with CardText element', () => {
    const wrapper = wrapComponent();
    expect(wrapper.find('CardText')).to.have.length(1);
  });

  it('renders with CardActions element', () => {
    const wrapper = wrapComponent();
    expect(wrapper.find('CardActions')).to.have.length(1);
  });

  it('renders with stay details', () => {
    const wrapper = wrapComponent();
    expect(wrapper.find('.stayDetail')).to.have.length(1);
  });

  it('contains a card with actions and a "Cancel Stay" button"', () => {
    const wrapper = wrapComponent();
    expect(wrapper.find('CardActions').find('FlatButton')).to.have.length(2);
    expect(wrapper.find('CardActions').find('[label="Cancel Stay"]')).to.have.length(1);
    wrapper.find('CardActions').find('[label="Cancel Stay"]').simulate('click');

  });

  it('CardHeader contains name', () => {
    const wrapper = wrapComponent();
    const headerTitle = wrapper.find('CardHeader').props('title');
    expect(JSON.stringify(headerTitle)).to.contain(stay.listing.name);
  });



});



//Review not yet implimented

//todo: make role 'host', populate with a new stay, set status to 'complete'. Try to review. Reviews guest
//todo: make role 'guest', populate with a new stay, set status to 'complete'. Try to review. Reviews guest