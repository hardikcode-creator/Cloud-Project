const IDENTITY_POOL = 'us-east-1:530ea7c4-3e00-472b-9d41-bc13a6051115';
const region = 'us-east-1';
const BOT_ID="CJHO58CT2D";
const  BOT_ALIAS_ID = "TSTALIASID";
const LOCALE_ID = "en_US";
const SESSION_ID = getDailySessionId();
    AWS.config.region = region;
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: IDENTITY_POOL
    });

    const lexruntimev2 = new AWS.LexRuntimeV2();

function getDailySessionId(){

    let userId = localStorage.getItem("userId");
    if(!userId)
    {
        userId = 'user-'+Math.random().toString(36).substring(2,10);
        localStorage.setItem("userId",userId);
    }
    return userId
}

function sendMessage(){
    const inputText = document.getElementById("message").value;
    if(!inputText)
        return ;
    const chat = document.getElementById("chat");
    chat.innerHTML+= `<div class='message user'>${inputText}</div>`;

    const params ={
        botId:BOT_ID,
        botAliasId:BOT_ALIAS_ID,
        localeId:LOCALE_ID,
        sessionId:SESSION_ID,
        text:inputText
    }
     lexruntimev2.recognizeText(params, (err, data) => {
    if (err) {
      chat.innerHTML += `<div class="message bot">Error calling bot</div>`;
    } else {
      const botMessage = data.messages && data.messages.length > 0
        ? data.messages.map(m => m.content).join('<br>')
        : "No reply";

      // Append bot message (left)
      chat.innerHTML += `<div class="message bot">${botMessage}</div>`;
      chat.scrollTop = chat.scrollHeight; // auto-scroll
    }
  });

  document.getElementById("message").value = "";



}