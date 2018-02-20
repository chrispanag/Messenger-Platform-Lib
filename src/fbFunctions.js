// Facebook Send API related modules
const fetch = require('node-fetch');
const promiseDelay = require('promise-delay');
const autoBind = require('auto-bind-inheritance');

const FBApi = require('./facebookAPI');

const defaultFieldsUserData = [
  'first_name', 
  'last_name', 
  'profile_pic', 
  'locale', 
  'timezone', 
  'gender'
]

function loggerDashbot (DASHBOT_API_KEY) {
  const dashbot = require('dashbot')(DASHBOT_API_KEY).facebook;

  return (body, templateID) => {
    if (templateID)
      body.dashbotTemplateId = templateID;

    const requestData = {
      url: 'https://graph.facebook.com/me/messages?',
      qs: this._qs,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      json: body
    };
    dashbot.logOutgoing(requestData, body);
  }
}

class FB extends FBApi {
  constructor(FB_PAGE_TOKEN, FB_APP_SECRET, logger = () => null) {
    super(FB_PAGE_TOKEN, FB_APP_SECRET);
    
    this._logger = logger;
    autoBind(this);
  }

  // Typing Indicators
  startsTyping (id) {
    return this.senderAction(id, "typing_on");
  }

  stopsTyping (id) {
    return this.senderAction(id, "typing_off");
  }

  markSeen (id) {
    return this.senderAction(id, "mark_seen");
  }

  /* 
    Sends a message to the user specified by the PSID id
    Params:
      id: A valid user PSID
      options: An object that defines the message sent
      {
        text: String,
        quickreplies: Array,
        attachment: Object,
        templateID: String,
        tag: String
      }
  */
  fbMessage(id, options) {
    let {text = null, quickreplies = null, attachment = null, templateID = null, tag = null, notification = "REGULAR", type = "RESPONSE"} = options;
    if (!(typeof options === "object"))
      text = options, quickreplies = null, attachment = null, templateID = null, tag = null, notification = "REGULAR", type = "RESPONSE";
      
    if (!id)
      throw new Error("fbMessage: No user id is specified!");

    if (!(text || attachment))
      throw new Error("fbMessage: No message content is specified!");

    const body = messageBuilder(id, text, quickreplies, attachment, tag, notification, type); // Set the body of the message
    return this.sendAPI(body).then(this._logger(body, templateID));
  }

  /*
    Sends a message after a delay
  */
  fbMessageDelay(delay, id, options) {
    return this.startsTyping(id).then(() => {
      return promiseDelay(delay).then(() => {
        return this.fbMessage(id, options)
      });
    });
  }

  _chainPromises(delay, id, messages, i) {
    if (i == (messages.length - 1))
      return this.fbMessageDelay(delay, id, messages[i]);

    return this.fbMessageDelay(delay, id, messages[i]).then(() => {
      return this._chainPromises(delay, id, messages, i+1)
    });
  }

  /*
    Sends the messages specified by the array messages to a specific user with a delay between them
  */
  chainFbMessages(delay, id, messages) {
    return this._chainPromises(delay, id, messages, 0);
  }
  
  getUserData(id, fields = defaultFieldsUserData) {
    const query = fields.join(',');
    return fetch(`https://graph.facebook.com/v2.11/${id}?fields=${query}&${this._qs}`, {
      method: 'GET'
    })
    .then(rsp => rsp.json())
    .then(json => {
      if (json.error && json.error.message) 
        throw new Error(json.error.message);
      return json;
    });
  }

  privateReply(id, message) {
    const body = JSON.stringify({
      id,
      message
    });
    return fetch(`https://graph.facebook.com/v2.10/${id}/private_replies?${this._qs}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body,
    })
    .then(rsp => rsp.json())
    .then(json => {
      if (json.error && json.error.message)
        throw new Error(json.error.message);

      return json;
    });
  }

  takeThread(id) {
    const body = JSON.stringify({
      recipient: {
        id
      }
    });
    return fetch(`https://graph.facebook.com/v2.6/me/take_thread_control?${this._qs}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body
    });
  }

  handover(id, { target_app_id = 263902037430900, metadata = "" }) {
    const body = JSON.stringify({
      recipient: {
        id
      },
      target_app_id,
      metadata
    });
    return fetch(`https://graph.facebook.com/v2.6/me/pass_thread_control?${this._qs}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body
    });
  }

}

module.exports = {
  FB, 
  loggerDashbot
};

// Gets an array of quick replies and creates a JSON array object with them.
function quickrepliesGen(array) {
  let quickreplies = [];
  for (let i = 0, len = array.length; i < len; i++) {
    if (array[i].payload) {
      quickreplies.push(quickreplyGen(array[i].text, array[i].payload));
    } else {
      quickreplies.push(quickreplyGen(array[i], "No Payload"));
    }
  }
  return quickreplies;
}

// Gets the text and the payload of a quick reply and returns the json of a quickreply
function quickreplyGen(title, payload) {
  if (title == "send_location" && payload == "No Payload")
    return {
      content_type : "location"
    };

  return {
    content_type : "text",
    title,
    payload : JSON.stringify(payload)
  };
}


// A function to build the body of a message
function messageBuilder(id, text, quickreplies, attachment, tag, notification_type = "REGULAR", messaging_type = "RESPONSE") {
  let quick_replies = null;
  // Handle Quick Replies (Facebook Send API)
  if (quickreplies) {
    if (!Array.isArray(quickreplies))
      throw new Error("fbMessage: Quickreplies is not an Array!");

    quick_replies = quickrepliesGen(quickreplies);
  }

  if (attachment)
    return {
      recipient: { id },
      message: {
        attachment: attachment,
      },
      notification_type,
      messaging_type,
      tag
    };

  return {
    recipient: { id },
    message: {text, quick_replies},
    notification_type,
    messaging_type,
    tag
  };
}
