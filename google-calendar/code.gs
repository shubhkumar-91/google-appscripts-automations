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


  const afterCommuteRaw = props.getProperty('AFTER_COMMUTE_KEYWORDS') || "#aftercommute, #return, #drivehome, Flight, Airport, Hotel";
  const afterCommuteRegexStr = afterCommuteRaw?.split(',')?.map(k => k.trim().toLowerCase())?.join("|");
  const afterCommuteRegex = new RegExp(afterCommuteRegexStr, 'i');

  for(let key in filteredEventsMap) {
    let filteredEvents = filteredEventsMap?.[key]?.eventList || [];
    filteredEvents.forEach(event => {
    const title = (event.summary || "").toLowerCase();
    const desc = (event.description || "").toLowerCase();
    const location = event.location;
    const attUsers = event?.attendees?.filter(user => !user?.self)?.map(user => user?.email)?.join();



    let fullText = title + " " + desc,
      aBufferTime = eventBuffersMap?.[bufferKeywordsRegex.exec(fullText)?.[0]?.toLowerCase() || "default"]?.['arrive'] || eventBuffersMap?.['default']?.['arrive'] || arrivalBuffer,
      pBufferTime = eventBuffersMap?.[bufferKeywordsRegex.exec(fullText)?.[0]?.toLowerCase() || "default"]?.['prep'] || eventBuffersMap?.['default']?.['prep'] || prepBuffer,
      postPBufferTime = eventBuffersMap?.[bufferKeywordsRegex.exec(fullText)?.[0]?.toLowerCase() || "default"]?.['postPrep'] || eventBuffersMap?.['default']?.['postPrep'] || pBufferTime;


    // 5. Maps API for Travel Duration
    const eventStart = new Date(event.start.dateTime || event.start.date || event.start);
    const eventEnd = new Date(event.end.dateTime || event.end.date || event.end);
    const isAfterCommute = afterCommuteRegex.test(fullText);

    const isTransit = transitKeywords.some(kw => title.includes(kw) || desc.includes(kw));
    if (isTransit) console.log(`🚈 TRANSIT mode detected : ${event.summary}`);

    // ----- PRE-COMMUTE LOGIC -----
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

      const originLocation = resolveLocation(location, desc, 'origin');

      // Call Maps Service with Traffic & Mode awareness
      const commuteEventTime = getTrafficAdjustedStartTime(originLocation, location, event.summary, eventStart, finalArrivalBuffer, finalPrepBuffer, isTransit);

      if (!commuteEventTime)
        console.error(`No directions found from maps for ${event.summary}, Check script for edge case here !!`);
      else if (alreadyHasCommute(key, title, commuteEventTime?.commuteStart, eventStart))
        console.log("⚠️ Due to race condition, the event already exist, skipping event addition here !!");
      else {
        let eventOpts = {description: `<ul><li>${isTransit ? "🚈 Transit" : "🚗 Drive"} Time: ${commuteEventTime?.durationText}</li><li>🏃🏻 Prep: ${finalPrepBuffer}m</li><li>🚩 Early: ${finalArrivalBuffer}m</li></ul>`};

        if(attUsers?.length)
          eventOpts = {...eventOpts, ...{guests: attUsers, sendInvites: true}};

        // Create the Commute Event
        CalendarApp.getCalendarById(key).createEvent(
          "🚗 Commute: " + (title || "#NO TITLE FOUND"),
          commuteEventTime?.commuteStart,
          eventStart,
          eventOpts
        ).setLocation(location).setColor(CalendarApp.EventColor.GRAY).removeAllReminders().addPopupReminder(5).addPopupReminder(20);
        console.log(commuteEventTime?.logMsg);
      }

    // ----- AFTER-COMMUTE LOGIC -----
    if (isAfterCommute) {
      let finalPostPrepBuffer = postPBufferTime;
      const customPostPrepBuffer = desc?.match(/(?:PostPrepTime|PostPrepBuffer|AfterPrepTime|AfterPrepBuffer):\s*(\d+)/i);

      // If custom Post Prep Buffer is found, override the default postPrepBuffer
      if (customPostPrepBuffer?.[1]?.trim()) {
        finalPostPrepBuffer = Number(customPostPrepBuffer?.[1]?.trim()) || postPBufferTime;
        // console.log("📍 Custom Post Prep Buffer found for event '" + title);
      }

      const destinationLocation = resolveLocation(location, desc, 'destination');
      const commuteEventTime = getAfterCommuteTimes(location, destinationLocation, event.summary, eventEnd, finalPostPrepBuffer, isTransit);

      if (!commuteEventTime)
        console.error(`No after-commute directions found from maps for ${event.summary}, Check script for edge case here !!`);
      else if (alreadyHasCommute(key, title, eventEnd, commuteEventTime?.commuteEnd))
        console.log("⚠️ Due to race condition, the after-commute event already exist, skipping addition.");
      else {
        let eventOpts = {description: `<ul><li>${isTransit ? "🚈 Transit" : "🚕 Drive"} Time: ${commuteEventTime?.durationText}</li><li>🏃🏻 Post-Prep: ${finalPostPrepBuffer}m</li></ul>`};

        if(attUsers?.length)
          eventOpts = {...eventOpts, ...{guests: attUsers, sendInvites: true}};

        CalendarApp.getCalendarById(key).createEvent(
          "🚕 After-Commute: " + (event.summary || "#NO TITLE FOUND"),
          commuteEventTime?.commuteStart,
          commuteEventTime?.commuteEnd,
          eventOpts
        ).setLocation(destinationLocation).setColor(CalendarApp.EventColor.GRAY).removeAllReminders().addPopupReminder(5).addPopupReminder(20);
        console.log(commuteEventTime?.logMsg);
      }
    }
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

function getAfterCommuteTimes(origin, destination, eventSummary, eventEndTime, postPrepBuffer = 30, isTransitRequested = false) {

  let travelMode = isTransitRequested ? Maps.DirectionFinder.Mode.TRANSIT : Maps.DirectionFinder.Mode.DRIVING;
  if(postPrepBuffer !== 30) console.log(`🚩 Custom Post-Prep Buffer = ${postPrepBuffer}, for event = ${eventSummary}`);
  var targetDepart = new Date(eventEndTime.getTime() + (postPrepBuffer * 60 * 1000));

  var directionsTraffic = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setDepart(targetDepart) // Depart AFTER the event + postPrepBuffer
    .setMode(travelMode)
    .getDirections();

  if (!directionsTraffic?.routes?.length) return null;

  var leg = directionsTraffic?.routes?.[0]?.legs?.[0];
  var trafficDurationSecs = leg?.duration_in_traffic?.value ?? leg?.duration?.value;

  var finalCommuteEnd = new Date(targetDepart.getTime() + (trafficDurationSecs * 1000));

  return {
    commuteStart: targetDepart,
    commuteEnd: finalCommuteEnd,
    durationText: leg?.duration_in_traffic?.text ?? leg?.duration?.text,
    start_address: leg?.start_address,
    end_address: leg?.end_address,
    logMsg: `Added after-commute for ${eventSummary} with ${isTransitRequested ? "Transit" : "Drive"} Time :- Normal: ${leg?.duration?.text} | with Traffic: ${leg?.duration_in_traffic?.text ?? "N/A"}`
  };
}



function alreadyHasCommute(calendarId, title, start, end) {
  const searchTitlePre = "🚗 Commute: " + title;
  const searchTitlePost = "🚕 After-Commute: " + title;
  const existingPre = CalendarApp.getCalendarById(calendarId).getEvents(start, end, {search: searchTitlePre});
  const existingPost = CalendarApp.getCalendarById(calendarId).getEvents(start, end, {search: searchTitlePost});
  return !!existingPre.length || !!existingPost.length
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
    skipFlagRaw = props.getProperty('SKIP_FLAG') || "#nocommute, #skip, Hotel",
    skipKeywordsRegexStr = skipFlagRaw?.split(',')?.map(k => k.trim().toLowerCase())?.join("|"),
    dynamicRegex = new RegExp(skipKeywordsRegexStr, 'i'),
    afterCommuteRaw = props.getProperty('AFTER_COMMUTE_KEYWORDS') || "#aftercommute, #return, #drivehome, Flight, Airport, Hotel",
    afterCommuteRegexStr = afterCommuteRaw?.split(',')?.map(k => k.trim().toLowerCase())?.join("|"),
    afterCommuteRegex = new RegExp(afterCommuteRegexStr, 'i'),
    now = new Date(),
    horizon = new Date(now),
    calendarList = Calendar.CalendarList?.list()?.items?.filter(({summary}) => dynamicCalRegex.test(summary));
  horizon.setDate(now.getDate() + lookAheadDays);
  horizon.setHours(23,59,59,999);
  // console.log("got skipFlagRaw = ", skipFlagRaw, "\n\n skipFlagRaw split arr = ", skipFlagRaw?.split(','), "\n\n props.getProperty('SKIP_FLAG') = ", props.getProperty('SKIP_FLAG'));
  // console.log("dynamicRegex = ", dynamicRegex);
  calendarList?.unshift({id: 'primary', summary: 'Primary'});

  const options = {
      timeMin: now.toISOString(),
      timeMax: horizon.toISOString(),
      singleEvents: true
    };

  let totalLength = 0, eventListMap = calendarList?.reduce((acc, {id: calId, summary}) => {
    let evnts = Calendar.Events.list(calId, options),
    pendingEvents = evnts?.items?.filter(({summary, description, location}) => {
      if (!location) return false;
      const fullText = (summary || "") + " " + (description || "");
      const isSkip = dynamicRegex.test(fullText);
      const isAfterCommute = afterCommuteRegex.test(fullText);
      if (isSkip && !isAfterCommute) return false;
      if(alreadyHasCommute(calId, summary, now, horizon)) return false;
      return true;
    }) || [];

    // let testList = evnts?.items?.filter(({location}) => !!location)?.forEach(({summary, attendees, location}) => {
    //   let attUsers = attendees?.filter(({self}) => !self)?.map(user => user?.email);
    //   console.log(`found location = ${location} in event ${summary}, with attendees \n ${attUsers}`);
    // });

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
    // RESET lock anyways in the end
    props.setProperty('CALENDAR_DIRTY', false);
    props.setProperty('CALENDAR_SCRIPT_RUNNING', false);
    lock?.releaseLock();
  }
}


function resolveLocation(eventLocation, eventDescription, locType = 'origin') {
  let props = PropertiesService.getScriptProperties(), cityPlaces = {},
    regexTemp = {origin: /(?:Start|Origin):\s*(.+)/i, destination: /(?:Destination|EndLocation):\s*(.+)/i },
    cityPlacesString = props.getProperty('CITY_PLACES_MAP') || props.getProperty('CITY_ORIGINS_MAP'),
    homeAddress = props.getProperty('HOME_ADDRESS'),
    customLocMatch = eventDescription?.match(regexTemp?.[locType])?.[1]?.trim(),
    locKeyType = /home|work|office|airport|hotel|default/i.exec(customLocMatch)?.[0]?.toLowerCase();
  try { cityPlaces = cityPlacesString ? JSON.parse(cityPlacesString) : {}; }
  catch(e) { console.error("Error parsing CITY_PLACES_MAP or CITY_ORIGINS_MAP property: " + e); }
  const dummyRoute = Maps.newDirectionFinder()
    .setOrigin(eventLocation)
    .setDestination(eventLocation)
    .getDirections();

  // start_address is usually "Building, Area, City, Zip, Country"
  let fullAddress = dummyRoute?.routes?.[0]?.legs?.[0]?.start_address,
    city = fullAddress?.split(',')?.map(p => p?.toLowerCase()?.trim()).slice(-4, -1)?.find(val => cityPlaces[val]),
    cityData = cityPlaces?.[city];

  // Fetch the specific origin address
  const resLocation = customLocMatch && !locKeyType ? customLocMatch : (cityData?.[locKeyType || 'home'] || cityData?.['default'] || cityPlaces['default'] || homeAddress);
  console.log(`📍 Custom ${locType} found for event, location set = ${resLocation}`);
  return resLocation;
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
