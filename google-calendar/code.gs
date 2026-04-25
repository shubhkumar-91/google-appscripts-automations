function syncCommuteFinal(filteredEvents = []) {
  const props = PropertiesService.getScriptProperties();

  // 1. Load Settings from Environment Variables (Script Properties)
  const homeAddress = props.getProperty('HOME_ADDRESS');
  const arrivalBuffer = parseInt(props.getProperty('ARRIVAL_BUFFER')) || 15;
  const prepBuffer = parseInt(props.getProperty('PREP_BUFFER')) || 5;

  // Keywords for Transit (add as many as you like)
  const transitKeywords = ["#transit", "#metro", "#bus", "#train"];


  filteredEvents.forEach(event => {
    const title = (event.summary || "").toLowerCase();
    const desc = (event.description || "").toLowerCase();
    const location = event.location;

    // 5. Maps API for Travel Duration
    const eventStart = new Date(event.start.dateTime || event.start.date || event.start);

    const isTransit = transitKeywords.some(kw => title.includes(kw) || desc.includes(kw));
    if (isTransit) console.log(`🚈 TRANSIT mode detected : ${title}`);



    // Get your default home base from properties
    let finalArrivalBuffer = arrivalBuffer, finalPrepBuffer = prepBuffer;

    const customArrivalBuffer = desc?.match(/(?:ArriveTime|ArrivalTime|ArriveBuffer|ArrivalBuffer):\s*(\d+)/i);
    const customPrepBuffer = desc?.match(/(?:PrepTime|PrepBuffer):\s*(\d+)/i);

    // If custom Arrive Buffer is found, override the default arrivalBuffer
    if (customArrivalBuffer?.[1]?.trim()) {
      finalArrivalBuffer = Number(customArrivalBuffer?.[1]?.trim()) || arrivalBuffer;
      // console.log("📍 Custom Arrive Buffer found for event '" + title);
    }

    // If custom Prep Buffer is found, override the default prepBuffer
    if (customPrepBuffer?.[1]?.trim()) {
      finalPrepBuffer = Number(customPrepBuffer?.[1]?.trim()) || prepBuffer;
      // console.log("📍 Custom Prep Buffer found for event '" + title);
    }


    const originLocation = findOrigin(location, desc);


    // Call Maps Service with Traffic & Mode awareness
      const commuteEventTime = getTrafficAdjustedStartTime(originLocation, location, title, eventStart, finalArrivalBuffer, finalPrepBuffer, isTransit);

      if (!commuteEventTime) {
        console.error(`No directions found from maps for ${title}, Check script for edge case here !!`);
        return;
      }

      // 2nd Duplicate check to avoid race condition runs, twice event creation
      if (alreadyHasCommute(title, commuteEventTime?.commuteStart, eventStart)) {
        console.log("⚠️ Due to race condition, the event already exist, skipping event addition here !!");
        return;
      }

      // 6. Create the Commute Event
      CalendarApp.getDefaultCalendar().createEvent(
        "🚗 Commute: " + (title || "#NO TITLE FOUND"),
        commuteEventTime?.commuteStart,
        eventStart,
        {description: `<ul><li>${isTransit ? "🚈 Transit" : "🚗 Drive"} Time: ${commuteEventTime?.durationText}</li><li>🏃🏻 Prep: ${finalPrepBuffer}m</li><li>🚩 Early: ${finalArrivalBuffer}m</li></ul>`}
      ).setLocation(commuteEventTime?.end_address).setColor(CalendarApp.EventColor.GRAY).removeAllReminders().addPopupReminder(5).addPopupReminder(20);
      console.log(commuteEventTime?.logMsg);
  });

  // Save the new token for the next trigger
  if (filteredEvents?.nextSyncToken) {
    props.setProperty('syncToken', filteredEvents.nextSyncToken);
  }
}




function getTrafficAdjustedStartTime(origin, destination, eventSummary, eventStartTime, arrivalBuffer = 15, prepBuffer = 5, isTransitRequested = false) {

  let travelMode = isTransitRequested ? Maps.DirectionFinder.Mode.TRANSIT : Maps.DirectionFinder.Mode.DRIVING;
  // 1. Set Target Arrival: 15 minutes before event starts
  if(arrivalBuffer !== 15) console.log(`🚩 Custom Arrive Buffer = ${arrivalBuffer}, for event = ${eventSummary}`);
  if(prepBuffer !== 5) console.log(`🏃🏻 Custom Prep Buffer = ${prepBuffer}, for event = ${eventSummary}`);
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


function alreadyHasCommute(title, start, end) {

  const searchTitle = "🚗 Commute: " + title;
  const existing = CalendarApp.getDefaultCalendar().getEvents(start, end, {search: searchTitle});
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


  const checkEvents = getEventsFiltered() ?? [];
  const isDirty = !!checkEvents?.length;
  props.setProperty('CALENDAR_DIRTY', isDirty);

  if(!isDirty) {
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

  console.log(`Found ${checkEvents?.length} new event(s). Flagged for processing.\nWorker will trigger after ${workerDebounceTime} minutes - `, new Date(nextRun));
}

function getEventsFiltered() {
  const props = PropertiesService.getScriptProperties();

  const lookAheadDays = parseInt(props.getProperty('LOOK_AHEAD_DAYS')) || 4;
  const skipFlagRaw = props.getProperty('SKIP_FLAG') || "#nocommute, Flight, Hotel";
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(now.getDate() + lookAheadDays);
  horizon.setHours(23,59,59,999);

  const skipKeywordsRegexStr = skipFlagRaw?.split(',')?.map(k => k.trim().toLowerCase())?.join("|");
  const dynamicRegex = new RegExp(skipKeywordsRegexStr, 'i');

  // 3. Setup Sync Options
  const options = {
    syncToken: props.getProperty('syncToken'),
    timeMin: now.toISOString(),
    timeMax: horizon.toISOString(),
    singleEvents: true
  };


  let eventList;
  try {
    eventList = Calendar.Events.list('primary', options);
  } catch (e) {
    // console.log("Sync token invalid or first run. Resetting Sync Token...");
    delete options.syncToken;
    eventList = Calendar.Events.list('primary', options);
  }

  const focusEvents = eventList?.items?.filter(({summary, description, location}) => location && !alreadyHasCommute(summary, now, horizon) && !(dynamicRegex.test(summary) || dynamicRegex.test(description))) || [];

  // let testList = eventList.items?.filter(({location}) => location)?.map(({summary, description}) => {return {...{summary, description}}});
  // console.log("got list of events = ", testList)

  // Save the new token for the next trigger
  if (eventList.nextSyncToken) {
    props.setProperty('syncToken', eventList.nextSyncToken);
  }

  return focusEvents;
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
    const newEvents = getEventsFiltered();
    syncCommuteFinal(newEvents);

    // RESET FLAG after successful run
    props.setProperty('CALENDAR_DIRTY', false);
    props.setProperty('CALENDAR_SCRIPT_RUNNING', false);
    console.log("Commute processing complete. Flags reset");

  } catch (e) { console.error("Could not obtain lock or error occurred: " + e.message); }
  finally { lock.releaseLock(); }
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



