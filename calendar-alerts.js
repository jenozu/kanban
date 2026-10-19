/* Driftboard calendar reminders for the Kanban page.
   Browser notifications work only while a Driftboard tab is active/open.
   A calendar-app import is needed for device reminders when the site is closed. */
(function () {
  "use strict";
  var CALENDAR_KEY="driftboard-calendar-v1",FIRED_KEY="driftboard-calendar-alerts-v1";
  function key(d) {return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
  function shouldRun(e,date,day){
    if(!e || date<e.date)return false;
    if(e.repeat==="once")return date===e.date;
    if(e.repeat==="daily")return true;
    if(e.repeat==="weekdays")return day>=1&&day<=5;
    if(e.repeat==="weekly")return Array.isArray(e.days)&&e.days.indexOf(day)!==-1;
    return false;
  }
  function check() {
    if(!("Notification" in window)||Notification.permission!=="granted")return;
    var now=new Date(),date=key(now),day=now.getDay(),events=[],completions={},fired={};
    try {var cal=JSON.parse(localStorage.getItem(CALENDAR_KEY)||"null");events=cal&&Array.isArray(cal.events)?cal.events:[];completions=cal&&cal.completions?cal.completions:{};fired=JSON.parse(localStorage.getItem(FIRED_KEY)||"{}")||{};}catch(err){return;}
    var dirty=false;
    events.forEach(function(e){
      if(!shouldRun(e,date,day)||e.reminder!==5||completions[e.id+"|"+date])return;
      var start=new Date(date+"T"+e.start+":00").getTime(),diff=start-now.getTime(),id=e.id+"|"+date;
      if(diff>0&&diff<=300000&&!fired[id]) {
        try {var notice=new Notification("Starting soon: "+e.title,{body:"Your scheduled block starts in five minutes.",tag:id});notice.onclick=function(){window.focus();notice.close();};fired[id]=Date.now();dirty=true;}
        catch(err){}
      }
    });
    if(dirty)try{localStorage.setItem(FIRED_KEY,JSON.stringify(fired));}catch(err){}
  }
  setInterval(check,20000);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)check();});
  window.addEventListener("focus",check);
  check();
})();