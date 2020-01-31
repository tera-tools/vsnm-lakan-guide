// vers 1.1.3

const format = require('./format.js');

const BossId = [781, 3000]; // Lakan NM

//MessageId: BossAction
const BossMessages = {
  9781043: 1192035708,    // Lakan has noticed you.
  9781044: 1192037407,    // Lakan is trying to take you on one at a time.
  9781045: 1192035605     // Lakan intends to kill all of you at once.
};

const BossActions = {
  1192035448: {msg: 'Get out'},                // Begone purple
  1192035449: {msg: 'Get in'},                 // Begone orange
  1192035705: {msg: 'Dodge + plague/regress'}, // Shield
  // > 30%
  1192035708: {msg: 'Debuff (closest)',    next: 1192037407,    prev: 1192035605}, // Debuff
  1192037407: {msg: 'Spread',              next: 1192035605,    prev: 1192035708}, // Spread aka Circles
  1192035605: {msg: 'Gather + cleanse',    next: 1192035708,    prev: 1192037407}, // Gather
  // < 30%
  1192035709: {msg: 'Debuff (furthest)',   next: 1192035606}, // Debuff
  1192037409: {msg: 'Gather',              next: 1192035709}, // Spread aka Circles
  1192035606: {msg: 'Gather + no cleanse', next: 1192037409}, // Gather
};

const InversedAction = {
  1192035708: 1192035709,
  1192037407: 1192037409,
  1192035605: 1192035606
};

const ShieldWarningTrigger = 0.35; //boss hp%
const ShieldWarningMessage = 'Ring soon, get ready to dodge';

module.exports = function VSNMLakanGuide(mod) {
  
  let enabled = true,
    sendToParty = false,
    showNextMechanicMessage = true,
    boss,
    shieldWarned,
    timerNextMechanic, 
    lastAction,
    isReversed;
    
  const chatHook = event => {		
    let command = format.stripTags(event.message).split(' ');
    
    if (['!vsnm-lakan', '!vsnmlakan'].includes(command[0].toLowerCase())) {
      toggleModule();
      return false;
    } else if (['!vsnm-lakan.party', '!vsnmlakan.party'].includes(command[0].toLowerCase())) {
      toggleSentMessages();
      return false;
    }
  }
  mod.hook('C_CHAT', 1, chatHook)	
  mod.hook('C_WHISPER', 1, chatHook)
    
  // command support
  try {
    const command = new require('command')(mod)
    command.on('vsnm-lakan', args => toggleModule())
    command.on('vsnmlakan', args => toggleModule())
    command.on('vsnm-lakan.party', args => toggleSentMessages())
    command.on('vsnmlakan.party', args => toggleSentMessages())
  } catch (e) {
    // do nothing because command is optional
  }
      
  function toggleModule() {
    enabled = !enabled;
    systemMessage((enabled ? 'enabled' : 'disabled'));
  }

  function toggleSentMessages() {
    sendToParty = !sendToParty;
    systemMessage((sendToParty ? 'Messages will be sent to the party' : 'Only you will see messages'));
  }	
  
  mod.hook('S_DUNGEON_EVENT_MESSAGE', 2, (event) => {	
    if (!enabled || !boss) return;
    
    let msgId = parseInt(event.message.replace('@dungeon:', ''));
    if (BossMessages[msgId]) {
      if (timerNextMechanic) clearTimeout(timerNextMechanic);
      sendMessage('Next: ' + BossActions[BossMessages[msgId]].msg);
      (bossHealth() > 0.5) ? isReversed = false : isReversed = true;
    }
  })
  
  function bossHealth() {
    return (boss.curHp / boss.maxHp);
  }
  
  mod.hook('S_BOSS_GAGE_INFO', 3, (event) => {
    if (!enabled) return;
    
    if (event.huntingZoneId === BossId[0] && event.templateId === BossId[1]) {
      boss = event;
    }
    
    if (boss) {
      let bossHp = bossHealth();
      if (bossHp > ShieldWarningTrigger) {
        shieldWarned = false;
      } else if (bossHp <= ShieldWarningTrigger && !shieldWarned) {
        sendMessage(ShieldWarningMessage);
        shieldWarned = true;
      } else if (bossHp <= 0) {
        boss = undefined;
        lastAction = undefined;
        isReversed = false;
        clearTimeout(timerNextMechanic);
      }
    }
   })
      
  mod.hook('S_ACTION_STAGE', 9, (event) => {
    if (!enabled || !boss) return;
    
    if (BossActions[event.skill]) {
      sendMessage(BossActions[event.skill].msg);
      
      if (!showNextMechanicMessage) return;

      let nextMessage;
      if (isReversed && BossActions[event.skill].prev) {                       // 50% to 30%
        nextMessage = BossActions[BossActions[event.skill].prev].msg;
        startTimer('Next: ' + nextMessage);
        lastAction = event.skill;
      } else if (BossActions[event.skill].next) {                              // 100% to 50% and 30% to 0%
        nextMessage = BossActions[BossActions[event.skill].next].msg;
        startTimer('Next: ' + nextMessage);
        lastAction = event.skill;
      } else if (event.skill == 1192035705 && lastAction) {                    // Shield (Mechanics inversing)
        nextMessage = BossActions[InversedAction[lastAction]].msg;
        startTimer('Next: ' + nextMessage);
      }
    }
  })
  
  function startTimer(message) {
    if (timerNextMechanic) clearTimeout(timerNextMechanic);
    timerNextMechanic = setTimeout(() => {
      sendMessage(message);
      timerNextMechanic = null;
    }, 8000);	
  }

  function sendMessage(msg) {
    if (!enabled) return;
    
    if (sendToParty) {
      mod.toServer('C_CHAT', 1, {
        channel: 21, //21 = p-notice, 1 = party
        message: msg
      });
    } else {
      mod.toClient('S_CHAT', 3, {
        channel: 21, //21 = p-notice, 1 = party
        authorName: 'DG-Guide',
        message: msg
      });
    }		
  }	
    
  function systemMessage(msg) {
    mod.toClient('S_CHAT', 3, {
      channel: 24, //system channel
      authorName: '',
      message: ' (VSNM-Lakan-Guide) ' + msg
    });
  }

}