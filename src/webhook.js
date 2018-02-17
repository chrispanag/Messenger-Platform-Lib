function webhook(messages, FB_PAGE_ID, logIncoming = () => null) {
  return (req, res) => {
    const data = req.body;
    
    // Send message to metrics
    logIncoming(data);

    if (data.object === 'page') {
      data.entry.forEach(entry => {
        // Messaging Standard Channel
        if (entry.messaging) {
          entry.messaging.forEach(e => {
            if (e.recipient.id === FB_PAGE_ID) messages(e);
          });
          return;
        }
        // If another channel is added that it is not handled then throw an error.
        // This may result to some messages being dropped but that will be rare.
        console.log(entry);
        throw new Error("Webhook: Unknown webhook channel");
      });
    } else
      // If the object sending the webhook requests is not a page
      throw new Error(`Webhook: Unknown data.object: ${data.object}`);
      
    // We send the 200 status as fast as we can.
    res.sendStatus(200);
  };
}

function messengerWebhook({attachmentHandler, textHandler, menuHandler, getContext}) {
  return data => {
    return getContext(data).then(messaging => {
      const id = messaging.sender.id;
      if (messaging.message) {
        // ECHOs
        if (messaging.message.is_echo) {
          console.log(`Echo message: ${messaging.message}`);
          return;
        }
        // ATTACHMENTS
        if (messaging.message.attachments)
          return attachmentHandler(id, messaging.message.attachments, messaging.user);
        // TEXT
        else if (messaging.message.text && !messaging.message.quick_reply)
          return textHandler(messaging.message, id, messaging.message.nlp, messaging.user);
        // QUICKREPLIES
        else if (messaging.message.quick_reply) {
          const payload = messaging.message.quick_reply.payload;
          // If there is no payload send message to wit
          if (payload == "\"No Payload\"")
            return textHandler(id, messaging.message.text, messaging.user);
          // If there is a payload
          return menuHandler(messaging, payload, messaging.user);
        }
      }
      // Button pushes
      if (messaging.postback && messaging.postback.payload) {
        // TODO Ref Links
        let ref = null;
        if (messaging.postback.referral)
          ref = messaging.postback.referral.ref;
        // TODO REF HANDLER
        return menuHandler(messaging, messaging.postback.payload, messaging.user, ref);
      }
      if (messaging.referral) {
        // TODO Ref Links
        let ref = null;
        if (messaging.postback.referral)
          ref = messaging.postback.referral.ref;
        // TODO REF handler
      }
    });
  };
}

module.exports = {
  webhook,
  messengerWebhook
}
