(function () {
  "use strict";

  var CALENDAR_KEY = "driftboard-calendar-v1";
  var BOARD_KEY = "driftboard-personal-v1";
  var ALERT_KEY = "driftboard-calendar-alerts-v1";
  var $ = function (id) { return document.getElementById(id); };
  var CATEGORY_COLOR = {routine:"#a99eff",work:"#91b8ed",personal:"#e5b98e",project:"#89cbd1"};
  var DAY_NAMES = ["SU","MO","TU","WE","TH","FR","SA"];
  var today = function () { return dateKey(new Date()); };
  var selected = today();
  var view = "day";
  var editing = null;
  var state = loadCalendar();
  var toastTimeout = null;

  function dateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth()+1).padStart(2,"0") + "-" + String(date.getDate()).padStart(2,"0");
  }
  function asDate(key) {
    var parts = key.split("-").map(Number);
    return new Date(parts[0], parts[1]-1, parts[2], 12, 0, 0);
  }
  function addDays(key, n) {
    var date=asDate(key);
    date.setDate(date.getDate()+n);
    return dateKey(date);
  }
  function monthMove(key, n) {
    var date=asDate(key);
    var day=date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth()+n);
    var last=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
    date.setDate(Math.min(day,last));
    return dateKey(date);
  }
  function weekStart(key) { return addDays(key,-((asDate(key).getDay()+6)%7)); }
  function escapeHTML(value) { return String(value == null ? "" : value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
  function icon(name) { return '<svg aria-hidden="true"><use href="#'+name+'"/></svg>'; }
  function uid() { return (typeof crypto!=="undefined" && crypto.randomUUID) ? crypto.randomUUID() : "e-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2); }
  function loadCalendar() {
    try {
      var d=JSON.parse(localStorage.getItem(CALENDAR_KEY) || "null");
      if(d && Array.isArray(d.events)) {
        return {version:1,events:d.events.filter(function(e){return e && typeof e.id==="string" && typeof e.date==="string" && typeof e.title==="string";}).slice(0,10000),completions:d.completions && typeof d.completions==="object" && !Array.isArray(d.completions) ? d.completions : {}};
      }
    } catch(err) { /* Blocked storage: keep running in memory. */ }
    return {version:1,events:[],completions:{}};
  }
  function loadBoard() {
    try {
      var result=JSON.parse(localStorage.getItem(BOARD_KEY)||"null");
      return result && Array.isArray(result.tasks) ? result : null;
    } catch(err) {return null;}
  }
  function save() {
    try {localStorage.setItem(CALENDAR_KEY,JSON.stringify(state));}
    catch(err){toast("Browser storage is blocked. Changes may not persist.");}
  }
  function toast(message) {
    var el=$("toast"); el.textContent=message;el.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout=setTimeout(function(){el.classList.remove("show");},3500);
  }
  function showDate(key,options) {
    return asDate(key).toLocaleDateString(undefined,options || {weekday:"long",month:"long",day:"numeric"});
  }
  function formatTime(t) {
    if(!t) return "";
    var parts=t.split(":").map(Number);
    return new Date(2026,0,1,parts[0],parts[1]).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
  }
  function stamp(key,t) {return new Date(key+"T"+t+":00").getTime();}
  function getEvents(key) {
    var dow=asDate(key).getDay();
    return state.events.filter(function(e){
      if(key<e.date) return false;
      if(e.repeat==="once") return key===e.date;
      if(e.repeat==="daily") return true;
      if(e.repeat==="weekdays") return dow>=1 && dow<=5;
      if(e.repeat==="weekly") return Array.isArray(e.days) && e.days.indexOf(dow)>=0;
      return false;
    }).sort(function(a,b){return String(a.start).localeCompare(String(b.start)) || (a.kind==="fixed"?-1:1);});
  }
  function completionId(event,key){return event.id+"|"+key;}
  function done(event,key){return !!state.completions[completionId(event,key)];}
  function setDone(event,key,yes) {
    var id=completionId(event,key);
    if(yes) state.completions[id]=Date.now();
    else delete state.completions[id];
    save();
    if(yes && event.linkedTaskId) {
      var board=loadBoard();
      if(board){
        var task=board.tasks.find(function(t){return t.id===event.linkedTaskId;});
        if(task && task.status!=="done") {
          task.status="done";task.updatedAt=Date.now();
          try{localStorage.setItem(BOARD_KEY,JSON.stringify(board));toast("Done! Linked Kanban task also completed.");}
          catch(err){toast("Calendar done. Kanban update could not be saved.");}
        }
      }
    }
    render();
  }
  function getDueTasks(key) {
    var board=loadBoard();
    if(!board)return [];
    return board.tasks.filter(function(t){return t && t.status!=="done" && t.due===key;}).map(function(t) {
      var p=(board.projects||[]).find(function(p){return p.id===t.projectId;});
      return {id:String(t.id),title:String(t.title),project:p?String(p.name):"Kanban"};
    });
  }
  function isPlannedTask(taskId,key) {
    return getEvents(key).some(function(e){return e.linkedTaskId===taskId;});
  }
  function updateTheme() {
    var board=loadBoard();
    var theme=board && board.theme==="light"?"light":"dark";
    document.documentElement.dataset.theme=theme;
    $("themeBtn").innerHTML=icon(theme==="light"?"moon":"sun");
  }
  function renderSummary() {
    var events=getEvents(selected),finished=events.filter(function(e){return done(e,selected);}).length;
    $("scheduledCount").textContent=events.length;
    $("completedCount").textContent=finished;
    $("fixedCount").textContent=events.filter(function(e){return e.kind==="fixed";}).length;
    $("progressText").textContent=finished+" / "+events.length;
    $("progressBar").style.width=(events.length?Math.round(100*finished/events.length):0)+"%";
  }
  function eventMini(e,key) {
    var color=CATEGORY_COLOR[e.category]||CATEGORY_COLOR.routine;
    return '<div class="mini-event '+(done(e,key)?"finished":"")+'" style="--stripe:'+color+'"><small>'+escapeHTML(formatTime(e.start))+'</small>'+escapeHTML(e.title)+'</div>';
  }
  function eventCard(e,key) {
    var checked=done(e,key);
    var cat=e.category==="work"?"Work":e.category==="personal"?"Personal":e.category==="project"?"Project":"Routine";
    return '<div class="event-row">'+
      '<div class="event-time"><strong>'+escapeHTML(formatTime(e.start))+'</strong><small>'+escapeHTML(formatTime(e.end))+'</small></div>'+
      '<div class="event-card '+(checked?"done":"")+'" style="--stripe:'+(CATEGORY_COLOR[e.category]||CATEGORY_COLOR.routine)+'">'+
      '<div style="min-width:0"><div class="event-title">'+escapeHTML(e.title)+'</div><div class="event-desc"><span class="pill '+(e.kind==="fixed"?"fixed":"")+'">'+(e.kind==="fixed"?"Fixed":"Flexible")+'</span><span class="pill">'+cat+'</span>'+(e.repeat!=="once"?'<span class="pill">Repeats</span>':"")+(e.notes?'<span title="'+escapeHTML(e.notes)+'">'+escapeHTML(e.notes.slice(0,68))+'</span>':"")+'</div></div>'+
      '<div class="event-actions"><button type="button" class="check-button '+(checked?"checked":"")+'" data-done="'+escapeHTML(e.id)+'" data-occ="'+key+'" aria-label="'+(checked?"Undo completion":"Mark completed")+'" title="'+(checked?"Undo completion":"Mark completed")+'">'+(checked?icon("check"):"")+'</button><button class="icon-button" type="button" data-edit="'+escapeHTML(e.id)+'" title="Edit series" aria-label="Edit event">'+icon("edit")+'</button></div></div></div>';
  }
  function renderDay() {
    $("scheduleHeading").textContent=selected===today()?"Today's timetable":showDate(selected,{weekday:"long",month:"long",day:"numeric"});
    $("scheduleSubheading").textContent="Fixed commitments first, flexible tasks around them";
    var events=getEvents(selected);
    if(!events.length) {
      $("calendarStage").innerHTML='<div class="empty"><h3>Your schedule has breathing room.</h3><p>Add a fixed commitment, plan a project task, or start with an editable sample routine based on your goals.</p><button class="btn primary" data-action="template">Use a starter schedule</button></div>';
      return;
    }
    var html='<div class="day-schedule">',group="";
    events.forEach(function(e) {
      var hr=Number(e.start.split(":")[0]);
      var part=hr<12?"Morning":hr<17?"Afternoon":"Evening";
      if(part!==group){group=part;html+='<h3 class="day-group">'+part+'</h3>';}
      html+=eventCard(e,selected);
    });
    $("calendarStage").innerHTML=html+"</div>";
  }
  function renderWeek() {
    var start=weekStart(selected);
    $("scheduleHeading").textContent="Your weekly timetable";
    $("scheduleSubheading").textContent="Select any day for its full agenda";
    var html='<div class="week-grid">';
    for(var i=0;i<7;i++){
      var key=addDays(start,i),ev=getEvents(key);
      html+='<button class="week-day '+(key===today()?"today":"")+'" data-pickday="'+key+'"><span class="weekday">'+showDate(key,{weekday:"short"})+'</span><span class="number">'+asDate(key).getDate()+'</span>'+ev.slice(0,7).map(function(e){return eventMini(e,key);}).join("")+(ev.length>7?'<small style="color:var(--muted)">+'+(ev.length-7)+' more</small>':"")+(ev.length===0?'<span style="font-size:10px;color:var(--sub)">Open day</span>':"")+"</button>";
    }
    $("calendarStage").innerHTML=html+"</div>";
  }
  function renderMonth() {
    $("scheduleHeading").textContent="Month at a glance";
    $("scheduleSubheading").textContent="Choose a date to open its daily timetable";
    var first=selected.slice(0,7)+"-01",start=weekStart(first);
    var html='<div class="month-grid">';
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(function(label){html+='<div class="month-weekday">'+label+"</div>";});
    for(var i=0;i<42;i++){
      var key=addDays(start,i),ev=getEvents(key);
      html+='<button class="month-day '+(key===today()?"today ":"")+(key===selected?"selected ":"")+(key.slice(0,7)!==selected.slice(0,7)?"outside":"")+'" data-pickday="'+key+'"><span class="num">'+asDate(key).getDate()+'</span>'+ev.slice(0,3).map(function(e){return eventMini(e,key);}).join("")+(ev.length>3?'<span class="more">+'+(ev.length-3)+' more</span>':"")+"</button>";
    }
    $("calendarStage").innerHTML=html+"</div>";
  }
  function renderNext() {
    var key=selected===today()?today():selected;
    var now=Date.now();
    var next=getEvents(key).find(function(e){return !done(e,key) && (key!==today() || stamp(key,e.start)>=now);});
    $("nextEvent").innerHTML=next?'<strong>'+escapeHTML(next.title)+'</strong><small>'+escapeHTML(formatTime(next.start))+' — '+escapeHTML(formatTime(next.end))+(next.kind==="fixed"?" · Fixed commitment":" · Flexible")+'</small>':'<small>No upcoming blocks for this day.</small>';
  }
  function renderDue() {
    var tasks=getDueTasks(selected);
    var html=tasks.length?"":'<p>Nothing outstanding on this date.</p>';
    tasks.forEach(function(t){
      html+='<div class="due-item"><div><strong>'+escapeHTML(t.title)+'</strong><small>'+escapeHTML(t.project)+'</small></div>'+
      (isPlannedTask(t.id,selected)?'<span class="pill">Planned</span>':'<button class="link" data-plan="'+escapeHTML(t.id)+'">Schedule</button>')+"</div>";
    });
    $("dueTasks").innerHTML=html;
  }
  function renderPeriod(){
    if(view==="day")$("periodTitle").textContent=showDate(selected,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
    if(view==="week")$("periodTitle").textContent=showDate(weekStart(selected),{month:"short",day:"numeric"})+" – "+showDate(addDays(weekStart(selected),6),{month:"short",day:"numeric",year:"numeric"});
    if(view==="month")$("periodTitle").textContent=showDate(selected,{month:"long",year:"numeric"});
    document.querySelectorAll("[data-view]").forEach(function(b){b.classList.toggle("active",b.dataset.view===view);});
  }
  function render(){
    updateTheme();renderPeriod();renderSummary();
    if(view==="day")renderDay();
    else if(view==="week")renderWeek();
    else renderMonth();
    renderDue();renderNext();renderAlertButton();
  }
  function loadTaskOptions(){
    var board=loadBoard();
    var el=$("linkedTask");
    el.innerHTML='<option value="">None — calendar only</option>';
    if(!board)return;
    board.tasks.filter(function(t){return t.status!=="done";}).forEach(function(t){
      var opt=document.createElement("option");opt.value=t.id;opt.textContent=t.title.slice(0,90);el.appendChild(opt);
    });
  }
  function openEvent(event,options){
    options=options||{};
    editing=event?event.id:null;
    loadTaskOptions();
    $("dialogTitle").textContent=event?"Edit scheduled event":"New calendar event";
    $("eventTitle").value=event?event.title:options.title||"";
    $("eventDate").value=event?event.date:options.date||selected;
    $("eventRepeat").value=event?event.repeat:"once";
    $("eventStart").value=event?event.start:options.start||"18:00";
    $("eventEnd").value=event?event.end:options.end||"18:45";
    $("eventKind").value=event?event.kind:"fixed";
    $("eventCategory").value=event?event.category:(options.linkedTaskId?"project":"routine");
    $("eventReminder").value=event?String(event.reminder||0):"5";
    $("linkedTask").value=event?event.linkedTaskId||"":options.linkedTaskId||"";
    $("eventNotes").value=event?event.notes||"":"";
    var days=event && Array.isArray(event.days)?event.days:[asDate($("eventDate").value).getDay()];
    document.querySelectorAll("[data-day]").forEach(function(box){box.checked=days.indexOf(Number(box.value))>=0;});
    $("deleteEvent").hidden=!event;
    repeatVisibility();
    $("eventDialog").showModal();
    $("eventTitle").focus();
  }
  function closeDialog(){ $("eventDialog").close();editing=null; }
  function repeatVisibility(){$("weekdaysWrap").hidden=$("eventRepeat").value!=="weekly";}
  function submitEvent(e){
    e.preventDefault();
    var title=$("eventTitle").value.trim(),date=$("eventDate").value,start=$("eventStart").value,end=$("eventEnd").value;
    var repeat=$("eventRepeat").value,days=Array.from(document.querySelectorAll("[data-day]:checked")).map(function(b){return Number(b.value);});
    if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!start||!end){toast("Enter a title, date and times.");return;}
    if(end<=start){toast("The end time needs to be after the start time.");return;}
    if(repeat==="weekly" && !days.length){toast("Choose at least one day for your weekly repeat.");return;}
    var existing=editing?state.events.find(function(e){return e.id===editing;}):null;
    var event=existing||{id:uid()};
    event.title=title.slice(0,140);event.date=date;event.start=start;event.end=end;
    event.repeat=repeat;event.days=repeat==="weekly"?days:[];
    event.kind=$("eventKind").value==="flexible"?"flexible":"fixed";
    event.category=Object.prototype.hasOwnProperty.call(CATEGORY_COLOR,$("eventCategory").value)?$("eventCategory").value:"routine";
    event.reminder=Number($("eventReminder").value)===5?5:0;
    event.linkedTaskId=$("linkedTask").value||"";
    event.notes=$("eventNotes").value.slice(0,1000);
    if(!existing)state.events.push(event);
    save();if(!existing)selected=date;closeDialog();render();toast(existing?"Event updated":"Event added to your timetable");
  }
  function deleteEvent(){
    var existing=state.events.find(function(e){return e.id===editing;});
    if(!existing || !confirm("Delete the entire scheduled series for "+existing.title+"?"))return;
    state.events=state.events.filter(function(e){return e.id!==editing;});
    Object.keys(state.completions).forEach(function(key){if(key.indexOf(editing+"|")===0)delete state.completions[key];});
    save();closeDialog();render();toast("Event removed");
  }
  function addStarter(){
    if(!confirm("Add a suggested routine: weekday work, daily tidy-up, workouts on Monday/Wednesday/Friday, dinner, nighttime routine, and a Sunday reset? You can edit every event."))return;
    var k=today();
    var examples=[
      ["Work", "07:30","16:00","weekdays",[],"work","fixed","Protect your work hours."],
      ["15-minute room reset", "17:30","17:45","daily",[],"personal","fixed","Clear surfaces, put away clothes, reset the room."],
      ["Workout", "18:00","18:50","weekly",[1,3,5],"routine","fixed","Put workout clothes out in advance."],
      ["Make dinner", "19:30","20:15","daily",[],"personal","fixed","Decide what to eat before starting."],
      ["Night routine / get ready for bed", "21:30","22:00","daily",[],"routine","fixed","Tidy, brush teeth, prepare tomorrow, wind down."],
      ["Weekly planning session", "17:00","17:30","weekly",[0],"personal","flexible","Review the coming week and schedule priorities."]
    ];
    examples.forEach(function(x){state.events.push({id:uid(),title:x[0],date:k,start:x[1],end:x[2],repeat:x[3],days:x[4],category:x[5],kind:x[6],notes:x[7],reminder:5,linkedTaskId:""});});
    save();view="day";selected=k;render();toast("Six starter routines added. Edit them to suit your real life.");
    $("sidebar").classList.remove("show");$("shade").classList.remove("show");
  }
  function createIcs(){
    if(!state.events.length){toast("Add a calendar event before exporting.");return;}
    function utcStamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");}
    function icsEscape(t){return String(t||"").replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
    function stampIcs(date,time){return date.replace(/-/g,"")+"T"+time.replace(":","")+"00";}
    var lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Driftboard//Personal Schedule//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Driftboard Routines"];
    state.events.forEach(function(e){
      var first=e.date;
      if(e.repeat==="weekdays"){for(var i=0;i<7 && (asDate(first).getDay()===0||asDate(first).getDay()===6);i++)first=addDays(first,1);}
      if(e.repeat==="weekly"&&Array.isArray(e.days)&&e.days.length){for(var j=0;j<7&&!e.days.includes(asDate(first).getDay());j++)first=addDays(first,1);}
      lines.push("BEGIN:VEVENT","UID:"+e.id+"@driftboard.local","DTSTAMP:"+utcStamp(),"DTSTART:"+stampIcs(first,e.start),"DTEND:"+stampIcs(first,e.end),"SUMMARY:"+icsEscape(e.title),"DESCRIPTION:"+icsEscape(e.notes||"Created with Driftboard"),"CATEGORIES:"+icsEscape(e.category||"Routine"));
      if(e.repeat==="daily")lines.push("RRULE:FREQ=DAILY");
      else if(e.repeat==="weekdays")lines.push("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
      else if(e.repeat==="weekly")lines.push("RRULE:FREQ=WEEKLY;BYDAY="+(e.days||[]).map(function(d){return DAY_NAMES[d];}).join(","));
      if(e.reminder===5)lines.push("BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEscape("Starting in five minutes: "+e.title),"TRIGGER:-PT5M","END:VALARM");
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    var blob=new Blob([lines.join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="driftboard-routines.ics";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);
    toast("Calendar file exported. Check reminders after importing.");
  }
  function renderAlertButton(){
    var button=$("enableAlerts"),status=$("alertStatus");
    if(!("Notification" in window)){button.disabled=true;button.textContent="Alerts unavailable";status.textContent="This browser cannot display notifications. Use calendar export for device reminders.";return;}
    if(Notification.permission==="granted"){button.innerHTML=icon("check")+" 5-minute alerts enabled";status.textContent="Alerts appear while Driftboard is open. They may be delayed by browser background restrictions; import your calendar for closed-app reminders.";}
    else if(Notification.permission==="denied"){button.textContent="Alerts blocked by browser";button.disabled=true;status.textContent="Allow notifications for this site in browser settings, or export your schedule to a calendar app.";}
    else {button.innerHTML=icon("bell")+" Enable 5-minute alerts";status.textContent="Allow browser notifications to be alerted while this page is open. For reminders when the page is closed, import the calendar file and check app notification settings.";}
  }
  async function enableAlerts(){
    if(!("Notification" in window))return;
    if(Notification.permission==="default"){
      try {var permission=await Notification.requestPermission();toast(permission==="granted"?"Alerts enabled while Driftboard is open.":"Notifications were not enabled.");}
      catch(err){toast("Could not request notification permission.");}
    }
    renderAlertButton();
    checkAlerts();
  }
  function checkAlerts(){
    if(!("Notification" in window) || Notification.permission!=="granted")return;
    var key=today(),now=Date.now(),fired={};
    try{fired=JSON.parse(localStorage.getItem(ALERT_KEY)||"{}")||{};}catch(err){}
    var changed=false;
    getEvents(key).forEach(function(e) {
      if(e.reminder!==5||done(e,key))return;
      var ms=stamp(key,e.start)-now;
      var id=completionId(e,key);
      if(ms>0 && ms<=5*60*1000 && !fired[id]) {
        try {
          var notification=new Notification("Starting soon: "+e.title,{body:formatTime(e.start)+" — clear distractions and get ready.",tag:id});
          notification.onclick=function(){window.focus();notification.close();};
          fired[id]=Date.now();changed=true;
        }catch(err){/* Permission/browser restrictions: do not mark as sent. */}
      }
    });
    if(changed){
      var cut=Date.now()-8*86400000;
      Object.keys(fired).forEach(function(id){if(fired[id]<cut)delete fired[id];});
      try{localStorage.setItem(ALERT_KEY,JSON.stringify(fired));}catch(err){}
    }
  }
  document.addEventListener("click",function(e){
    var node=e.target.closest("button");
    if(!node)return;
    if(node.dataset.view){view=node.dataset.view;render();return;}
    if(node.dataset.pickday){selected=node.dataset.pickday;view="day";render();return;}
    if(node.dataset.action==="template"){addStarter();return;}
    if(node.dataset.edit){var ev=state.events.find(function(x){return x.id===node.dataset.edit;});if(ev)openEvent(ev);return;}
    if(node.dataset.done){var current=state.events.find(function(x){return x.id===node.dataset.done;});if(current)setDone(current,node.dataset.occ,!done(current,node.dataset.occ));return;}
    if(node.dataset.plan){
      var due=getDueTasks(selected).find(function(t){return t.id===node.dataset.plan;});
      if(due)openEvent(null,{title:due.title,linkedTaskId:due.id,date:selected,start:"17:00",end:"17:45"});
    }
  });
  $("addEvent").onclick=function(){openEvent();};
  $("quickAdd").onclick=function(){openEvent();};
  $("closeDialog").onclick=closeDialog;
  $("cancelEvent").onclick=closeDialog;
  $("deleteEvent").onclick=deleteEvent;
  $("eventRepeat").onchange=repeatVisibility;
  $("eventForm").onsubmit=submitEvent;
  $("loadTemplateSide").onclick=addStarter;
  $("exportIcs").onclick=createIcs;
  $("exportIcsSide").onclick=createIcs;
  $("enableAlerts").onclick=enableAlerts;
  $("prev").onclick=function(){selected=view==="day"?addDays(selected,-1):view==="week"?addDays(selected,-7):monthMove(selected,-1);render();};
  $("next").onclick=function(){selected=view==="day"?addDays(selected,1):view==="week"?addDays(selected,7):monthMove(selected,1);render();};
  $("goToday").onclick=function(){selected=today();render();};
  $("themeBtn").onclick=function(){
    var board=loadBoard();
    if(!board){toast("Open your Kanban board first to initialize your workspace.");return;}
    board.theme=board.theme==="light"?"dark":"light";
    try{localStorage.setItem(BOARD_KEY,JSON.stringify(board));render();}catch(err){toast("Theme preference could not be saved.");}
  };
  $("menuBtn").onclick=function(){$("sidebar").classList.add("show");$("shade").classList.add("show");};
  $("shade").onclick=function(){$("sidebar").classList.remove("show");$("shade").classList.remove("show");};
  document.addEventListener("visibilitychange",function(){if(!document.hidden){checkAlerts();renderNext();}});
  window.addEventListener("focus",checkAlerts);
  window.addEventListener("storage",function(e){if(e.key===CALENDAR_KEY){state=loadCalendar();render();}else if(e.key===BOARD_KEY)render();});
  $("todayText").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  setInterval(checkAlerts,20000);
  render();
  checkAlerts();
})();