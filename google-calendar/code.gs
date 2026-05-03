function syncCommuteFinal(filteredEventsMap = {}) {
  const props = PropertiesService.getScriptProperties();

  // 1. Load Settings from Environment Variables (Script Properties)
  const homeAddress = props.getProperty('HOME_ADDRESS');
  const arrivalBuffer = parseInt(props.getProperty('ARRIVAL_BUFFER')) || 20;
  const prepBuffer = parseInt(props.getProperty('PREP_BUFFER')) || 15;

  // Load the new Dynamic Buffers Map
  const eventBuffersStr = props.getProperty('EVENT_BUFFERS_MAP');
  let eventBuffersMap = {};
  try { eventBuffersMap = eventBuffersStr ? JSON.parse(eventBuffersStr) : {}; }
  catch(e) { console.error("⚠️ Error parsing EVENT_BUFFERS_MAP property: " + e); }

  // Keywords for Transit (add as many as you like)
  const transitKeywords = ["#transit", "#metro", "#bus", "#train"];

  const bufferKeywordsRegexStr = Object.keys(eventBuffersMap)?.map(k => k.trim().toLowerCase())?.join("|");
  const bufferKeywordsRegex = new RegExp(bufferKeywordsRegexStr, 'i');

  for(let key in filteredEventsMap) {
    let filteredEvents = filteredEventsMap?.[key]?.eventList || [];
    filteredEvents.forEach(event => {
    const title = (event.summary || "").toLowerCase();
    const desc = (event.description || "").toLowerCase();
    const location = event.location;

    let fullText = title + " " + desc,
      aBufferTime = eventBuffersMap?.[bufferKeywordsRegex.exec(fullText)?.[0]?.toLowerCase() || "default"]?.['arrive'] || eventBuffersMap?.['default']?.['arrive'] || arrivalBuffer,
      pBufferTime = eventBuffersMap?.[bufferKeywordsRegex.exec(fullText)?.[0]?.toLowerCase() || "default"]?.['prep'] || eventBuffersMap?.['default']?.['prep'] || prepBuffer;


    // 5. Maps API for Travel Duration
    const eventStart = new Date(event.start.dateTime || event.start.date || event.start);

    const isTransit = transitKeywords.some(kw => title.includes(kw) || desc.includes(kw));
    if (isTransit) console.log(`🚈 TRANSIT mode detected : ${event.summary}`);



    // Get your default home base from properties
    let finalArrivalBuffer = aBufferTime, finalPrepBuffer = pBufferTime;

    const customArrivalBuffer = desc?.match(/(?:ArriveTime|ArrivalTime|ArriveBuffer|ArrivalBuffer):\s*(\d+)/i);
    const customPrepBuffer = desc?.match(/(?:PrepTime|PrepBuffer):\s*(\d+)/i);

    // If custom Arrive Buffer is found, override the default arrivalBuffer
    if (customArrivalBuffer?.[1]?.trim()) {
      finalArrivalBuffer = Number(customArrivalBuffer?.[1]?.trim()) || aBufferTime;
      // console.log("📍 Custom Arrive Buffer found for event '" + title);
    }

    // If custom Prep Buffer is found, override the default prepBuffer
    if (customPrepBuffer?.[1]?.trim()) {
      finalPrepBuffer = Number(customPrepBuffer?.[1]?.trim()) || pBufferTime;
      // console.log("📍 Custom Prep Buffer found for event '" + title);
    }


    const originLocation = findOrigin(location, desc);


    // Call Maps Service with Traffic & Mode awareness
      const commuteEventTime = getTrafficAdjustedStartTime(originLocation, location, event.summary, eventStart, finalArrivalBuffer, finalPrepBuffer, isTransit);

      if (!commuteEventTime) {
        console.error(`No directions found from maps for ${event.summary}, Check script for edge case here !!`);
        return;
      }

      // 2nd Duplicate check to avoid race condition runs, twice event creation
      if (alreadyHasCommute(key, title, commuteEventTime?.commuteStart, eventStart)) {
        console.log("⚠️ Due to race condition, the event already exist, skipping event addition here !!");
        return;
      }

      // 6. Create the Commute Event
      CalendarApp.getCalendarById(key).createEvent(
        "🚗 Commute: " + (event.summary || "#NO TITLE FOUND"),
        commuteEventTime?.commuteStart,
        eventStart,
        {description: `<ul><li>${isTransit ? "🚈 Transit" : "🚗 Drive"} Time: ${commuteEventTime?.durationText}</li><li>🏃🏻 Prep: ${finalPrepBuffer}m</li><li>🚩 Early: ${finalArrivalBuffer}m</li></ul>`}
      ).setLocation(location).setColor(CalendarApp.EventColor.GRAY).removeAllReminders().addPopupReminder(5).addPopupReminder(20);
      console.log(commuteEventTime?.logMsg);
  });
  }
}




function getTrafficAdjustedStartTime(origin, destination, eventSummary, eventStartTime, arrivalBuffer = 20, prepBuffer = 15, isTransitRequested = false) {

  let travelMode = isTransitRequested ? Maps.DirectionFinder.Mode.TRANSIT : Maps.DirectionFinder.Mode.DRIVING;
  // 1. Set Target Arrival: 15 minutes before event starts
  if(arrivalBuffer !== 20) console.log(`🚩 Custom Arrive Buffer = ${arrivalBuffer}, for event = ${eventSummary}`);
  if(prepBuffer !== 15) console.log(`🏃🏻 Custom Prep Buffer = ${prepBuffer}, for event = ${eventSummary}`);
  var targetArrive = new Date(eventStartTime.getTime() - (arrivalBuffer * 60 * 1000));

  // --- STEP 1: Get Initial Estimate ---
  var directionsEst = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setArrive(targetArrive)
    .setMode(travelMode)
    .getDirections();

  if (!directionsEst?.routes?.length) return null; // Handle error

  // Get standard duration (in seconds)
  var standardDurationSecs = directionsEst?.routes?.[0]?.legs?.[0]?.duration?.value;

  // Calculate Tentative Departure Time
  // (Target Arrive - Standard Duration)
  var tentativeDepart = new Date(targetArrive.getTime() - (standardDurationSecs * 1000) - (prepBuffer * 60 * 1000));

  // --- STEP 2: Get Traffic Reality Check ---
  var directionsTraffic = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setDepart(tentativeDepart) // Crucial: Using setDepart triggers traffic data
    .setMode(travelMode)
    .getDirections();

  // Extract duration_in_traffic if available, otherwise fallback to standard duration
  var leg = directionsTraffic?.routes?.[0]?.legs?.[0];
  var trafficDurationSecs = leg?.duration_in_traffic?.value ?? leg?.duration?.value;

  // --- STEP 3: Final Calculation ---
  // Actual Commute Start = Target Arrival - Real Traffic Duration
  var finalCommuteStart = new Date(targetArrive.getTime() - (trafficDurationSecs * 1000));

  return {
    commuteStart: finalCommuteStart,
    durationText: leg?.duration_in_traffic?.text ?? leg?.duration?.text,
    start_address: leg?.start_address,
    end_address: leg?.end_address,
    logMsg: `Added commute for ${eventSummary} with ${isTransitRequested ? "Transit" : "Drive"} Time :- Normal: ${leg?.duration?.text} | with Traffic: ${leg?.duration_in_traffic?.text ?? "N/A"}`
  };
}


function alreadyHasCommute(calendarId, title, start, end) {

  const searchTitle = "🚗 Commute: " + title;
  const existing = CalendarApp.getCalendarById(calendarId).getEvents(start, end, {search: searchTitle});
  return !!existing.length;
}


function markCalendarDirty() {
  const props = PropertiesService.getScriptProperties();
  const isScriptRunning = props.getProperty('CALENDAR_SCRIPT_RUNNING') || 'false';
  const workerDebounceTime = props.getProperty('WORKER_DEBOUNCE_TIMER') || 8;

  if (isScriptRunning === 'true') {
    console.log("calendar script running, skip fetching new events");
    return;
  }


  const eventCount = getEventsFiltered()?.totalCount;
  props.setProperty('CALENDAR_DIRTY', !!eventCount);

  if(!eventCount) {
    console.log("No new events found, No processing needed.");
    return;
  };

  const allTriggers = ScriptApp.getProjectTriggers();

  // 1. DELETE ANY EXISTING DYNAMIC TRIGGERS FIRST (The Debounce)
  allTriggers.forEach(t => {
    if (t.getHandlerFunction() === 'processedDeferredCommute') ScriptApp.deleteTrigger(t);
  });

  // 2. CREATE A FRESH ONE-TIME TRIGGER TO RUN AFTER X MINUTES
  ScriptApp.newTrigger('processedDeferredCommute')
    .timeBased()
    .after(workerDebounceTime * 60 * 1000) // debounce minutes in milliseconds
    .create();

    let nextRun = Date.now() + (workerDebounceTime * 60 * 1000);

  console.log(`Found ${eventCount} new event(s). Flagged for processing.\nWorker will trigger after ${workerDebounceTime} minutes - `, new Date(nextRun));
}

function getEventsFiltered() {
  let props = PropertiesService.getScriptProperties(),
    sharedCalsRaw = props.getProperty('SHARED_CALENDAR_NAMES') || "",
    sharedCalsRegexStr = sharedCalsRaw?.split(',')?.map(k => k.trim())?.join("|"),
    dynamicCalRegex = new RegExp(sharedCalsRegexStr, 'i'),
    lookAheadDays = parseInt(props.getProperty('LOOK_AHEAD_DAYS')) || 4,
    skipFlagRaw = props.getProperty('SKIP_FLAG') || "#nocommute, Flight, Hotel",
    skipKeywordsRegexStr = skipFlagRaw?.split(',')?.map(k => k.trim().toLowerCase())?.join("|"),
    dynamicRegex = new RegExp(skipKeywordsRegexStr, 'i');
    now = new Date(),
    horizon = new Date(now),
    calendarList = Calendar.CalendarList?.list()?.items?.filter(({summary}) => dynamicCalRegex.test(summary));
  horizon.setDate(now.getDate() + lookAheadDays);
  horizon.setHours(23,59,59,999);
  calendarList?.unshift({id: 'primary', summary: 'Primary'});

  const options = {
      timeMin: now.toISOString(),
      timeMax: horizon.toISOString(),
      singleEvents: true
    };

  let totalLength = 0, eventListMap = calendarList?.reduce((acc, {id: calId, summary}) => {
    let evnts = Calendar.Events.list(calId, options),
    pendingEvents = evnts?.items?.filter(({summary, description, location}) => location && !alreadyHasCommute(calId, summary, now, horizon) && !(dynamicRegex.test(summary) || dynamicRegex.test(description))) || [];
    acc[calId] = {name: summary, calId, eventList: pendingEvents, count: pendingEvents?.length};
    totalLength += pendingEvents?.length;
    return acc;
  }, {});
  eventListMap['totalCount'] = totalLength;

  return eventListMap;
}


function processedDeferredCommute() {
  const props = PropertiesService.getScriptProperties();

  // Only proceed if a change was flagged
  if (props.getProperty('CALENDAR_DIRTY') !== 'true') {
    console.log("calendar not dirty, skip run");
    return;
  }

  // LOCK SERVICE: Prevents race conditions
  const lock = LockService.getScriptLock();
  props.setProperty('CALENDAR_SCRIPT_RUNNING', true);
  try {
    // Wait up to 30 seconds for a concurrent run to finish
    lock.waitLock(30000);

    // RUN YOUR MAIN LOGIC
    const eventMap = getEventsFiltered();
    // safety count check to avoid race-condition
    if(!eventMap?.totalCount) {
      console.log(`no events found, total count is ${eventMap?.totalCount} , skipping run`);
      // RESET FLAG after successful run
      props.setProperty('CALENDAR_DIRTY', false);
      props.setProperty('CALENDAR_SCRIPT_RUNNING', false);
      lock?.releaseLock();
      return;
    }
    syncCommuteFinal(eventMap);

    console.log("Commute processing complete. Flags reset");

  } catch (e) { console.error("Could not obtain lock or error occurred: " + e.message); }
  finally {
    // RESET FLAG after successful run
    props.setProperty('CALENDAR_DIRTY', false);
    props.setProperty('CALENDAR_SCRIPT_RUNNING', false);
    lock?.releaseLock();
  }
}


function findOrigin(eventLocation, eventDescription) {
  let props = PropertiesService.getScriptProperties(), cityOrigins = {},
    cityOriginsString = props.getProperty('CITY_ORIGINS_MAP'),
    homeAddress = props.getProperty('HOME_ADDRESS'),
    customOriginMatch = eventDescription?.match(/(?:Start|Origin):\s*(.+)/i)?.[1]?.trim(),
    originType = /home|work|office/i.exec(customOriginMatch)?.[0]?.toLowerCase();
  try { cityOrigins = cityOriginsString ? JSON.parse(cityOriginsString) : {}; }
  catch(e) { console.error("Error parsing CITY_ORIGINS_MAP property: " + e); }
  const dummyRoute = Maps.newDirectionFinder()
    .setOrigin(eventLocation)
    .setDestination(eventLocation)
    .getDirections();

  // start_address is usually "Building, Area, City, Zip, Country"
  let fullAddress = dummyRoute?.routes?.[0]?.legs?.[0]?.start_address,
    city = fullAddress?.split(',')?.map(p => p?.toLowerCase()?.trim()).slice(-4, -1)?.find(val => cityOrigins[val]),
    cityData = cityOrigins?.[city];

  // Fetch the specific origin address
  const originLocation = customOriginMatch && !originType ? customOriginMatch : (cityData?.[originType || 'home'] || cityOrigins['default'] || homeAddress);
  console.log("📍 Custom origin found for event, location set = " + originLocation);
  return originLocation;
}


// One Time programmatically create triggers on shared Calendar(s)
function setCalendarUpdateTriggers() {
  let props = PropertiesService.getScriptProperties(),
    sharedCalsRaw = props.getProperty('SHARED_CALENDAR_NAMES') || "",
    sharedCalsRegexStr = sharedCalsRaw?.split(',')?.map(k => k.trim())?.join("|"),
    dynamicCalRegex = new RegExp(sharedCalsRegexStr, 'i'),
  calendarList = Calendar.CalendarList?.list()?.items?.filter(({summary}) => dynamicCalRegex.test(summary));
  calendarList.forEach(({id}) => {
    ScriptApp.newTrigger('markCalendarDirty')
    .forUserCalendar(id)
    .onEventUpdated()
    .create();
  });
}
