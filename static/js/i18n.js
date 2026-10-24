/**
 * Baari — static/js/i18n.js
 * Comprehensive trilingual localization dictionary (English, Hindi, Marathi).
 */

const I18N = {
  en: {
    app_title: "Baari (बारी)",
    tagline: "Come at your time, not at 4 AM.",
    nav_patient: "🎫 Patient Kiosk",
    nav_staff: "📋 Staff Console",
    nav_sim: "📊 OPD Simulation",
    nav_admin: "⚙️ Admin Control",
    nav_login: "🔐 Staff / Admin Login",
    nav_logout: "Logout",

    // Kiosk
    kiosk_heading: "Get Your OPD Turn (Token)",
    kiosk_sub: "Speak in your mother tongue or type below. No smartphone app needed.",
    voice_mic_idle: "Tap to Speak (Voice Token)",
    voice_mic_recording: "Listening... Speak your name & problem",
    voice_mic_processing: "Processing speech...",
    voice_mic_help: "Try saying: 'My name is Rahul Sharma, I have a fever' or 'Doctor for leg pain'",
    or_type: "— OR ENTER DETAILS MANUALLY —",
    label_name: "Patient Name *",
    label_phone: "Mobile Number (Optional)",
    label_dept: "Select Department *",
    btn_request_token: "Generate Token & Arrival Time",

    // Departments
    dept_G: "General Medicine",
    dept_O: "Orthopedics",
    dept_Y: "Gynecology",
    dept_P: "Pediatrics",

    // Token Modal / Tracker
    token_issued_title: "Your OPD Turn is Confirmed!",
    token_number_label: "TOKEN NUMBER",
    token_pin_label: "SECRET 4-DIGIT PIN (Save this):",
    token_pin_hint: "Write this down or memorize it to check status later.",
    token_est_wait: "Estimated Wait Time",
    token_arrive_at: "Recommended Arrival Time",
    btn_listen_token: "🔊 Read Token & PIN Aloud",
    btn_track_live: "Track Live Queue Status",

    // Live Tracking
    track_heading: "Check Your Live Turn Status",
    track_sub: "Enter your token number and PIN to see when to arrive.",
    input_token_num_ph: "e.g. G-04",
    input_pin_ph: "4-Digit PIN",
    btn_check_status: "Check Status",
    stepper_1: "Token Issued",
    stepper_2: "Rest at Home",
    stepper_3: "Travel to OPD",
    stepper_4: "In Consultation",

    travel_slider_label: "Adjust your travel time from home:",
    travel_min_suffix: "minutes away",

    // Status texts
    status_come_now: "🟢 Come now! Please proceed to your department waiting area.",
    status_wait_home: "🔵 Relax at home. Your estimated consultation window starts at:",
    status_called: "🔔 Your turn is active! Please enter the doctor's cabin.",
    status_done: "✅ Consultation completed. Wishing you a swift recovery!",
    status_noshow: "⚠️ Marked as No-Show. Please speak with the OPD reception desk.",

    // Staff Console
    staff_heading: "OPD Department Queue Board",
    btn_call_next: "📢 Call Next Patient",
    btn_issue_walkin: "➕ Issue Walk-in Token",
    active_doctors: "Active Doctors",
    waiting_patients: "Waiting in Queue",
    called_patients: "Currently in Cabin",
    done_today: "Completed Today",
    avg_service: "Average Consultation",
    capacity_warning: "⚠️ High Queue Load: Consider activating available doctor to reduce wait times.",
    action_mark_done: "Done",
    action_mark_noshow: "No-Show",
    action_set_priority: "Priority",

    // Simulation
    sim_heading: "OPD Crowd & Wait Reduction Simulator",
    sim_sub: "Compare standard pre-dawn hospital hall crowding (4 AM rush) vs. Baari's staggered arrival model.",
    sim_param_patients: "Patients per Day",
    sim_param_doctors: "Active Doctor Counters",
    sim_param_adherence: "Baari Guidance Adherence",
    sim_btn_run: "Run Discrete-Event Simulation",
    sim_metric_wait_red: "Average Wait Reduction",
    sim_metric_crowd_red: "Peak Waiting Crowd Cut",
    sim_metric_hours_saved: "Patient Hours Saved Today",
    sim_chart_title: "OPD Hall Crowd Over Time (Waiting Room Congestion)",

    // Common
    minutes: "min",
    patients: "patients",
    close: "Close",
    loading: "Loading...",
  },

  hi: {
    app_title: "बारी (Baari)",
    tagline: "अपने समय पर आएं, सुबह 4 बजे नहीं।",
    nav_patient: "🎫 मरीज पर्ची (टोकन)",
    nav_staff: "📋 कर्मचारी कंसोल",
    nav_sim: "📊 भीड़ सिमुलेटर",
    nav_admin: "⚙️ अस्पताल प्रबंधन",
    nav_login: "🔐 स्टाफ / एडमिन लॉगिन",
    nav_logout: "लॉगआउट",

    // Kiosk
    kiosk_heading: "ओपीडी नंबर (टोकन) प्राप्त करें",
    kiosk_sub: "बोलकर या लिखकर अपना नंबर लें। किसी ऐप की आवश्यकता नहीं है।",
    voice_mic_idle: "बोलकर टोकन लें (माइक दबाएं)",
    voice_mic_recording: "सुन रहे हैं... अपना नाम और बीमारी बोलें",
    voice_mic_processing: "आवाज़ समझ रहे हैं...",
    voice_mic_help: "उदा: 'मेरा नाम राहुल शर्मा है, मुझे बुखार है' या 'हड्डी के डॉक्टर को दिखाना है'",
    or_type: "— या नीचे जानकारी भरें —",
    label_name: "मरीज का नाम *",
    label_phone: "मोबाइल नंबर (वैकल्पिक)",
    label_dept: "विभाग चुनें *",
    btn_request_token: "टोकन और आने का समय प्राप्त करें",

    // Departments
    dept_G: "सामान्य चिकित्सा (General Medicine)",
    dept_O: "अस्थि व हड्डी रोग (Orthopedics)",
    dept_Y: "स्त्री व प्रसूति रोग (Gynecology)",
    dept_P: "बाल एवं शिशु रोग (Pediatrics)",

    // Token Modal / Tracker
    token_issued_title: "आपकी बारी (टोकन) पक्की हो गई!",
    token_number_label: "टोकन नंबर",
    token_pin_label: "गुप्त 4-अंकीय पिन (इसे याद रखें):",
    token_pin_hint: "स्थिति जांचने के लिए इस पिन को लिखकर या याद रखें।",
    token_est_wait: "अनुमानित प्रतीक्षा समय",
    token_arrive_at: "अस्पताल पहुंचने का अनुशंसित समय",
    btn_listen_token: "🔊 टोकन और पिन बोलकर सुनें",
    btn_track_live: "लाइव कतार की स्थिति देखें",

    // Live Tracking
    track_heading: "अपनी बारी की लाइव स्थिति जांचें",
    track_sub: "टोकन नंबर और पिन दर्ज करके जानें कि कब अस्पताल आना है।",
    input_token_num_ph: "जैसे G-04",
    input_pin_ph: "4 अंकों का पिन",
    btn_check_status: "स्थिति देखें",
    stepper_1: "टोकन जारी",
    stepper_2: "घर पर आराम",
    stepper_3: "अस्पताल निकलें",
    stepper_4: "डॉक्टर के पास",

    travel_slider_label: "घर से अस्पताल आने का समय:",
    travel_min_suffix: "मिनट की दूरी",

    // Status texts
    status_come_now: "🟢 अभी आएं! कृपया अपने विभाग के प्रतीक्षालय में पहुंचे।",
    status_wait_home: "🔵 घर पर विश्राम करें। आपका समय लगभग इस समय आएगा:",
    status_called: "🔔 आपका नंबर आ गया है! कृपया डॉक्टर के केबिन में जाएं।",
    status_done: "✅ परामर्श पूरा हो गया। आपके शीघ्र स्वस्थ होने की कामना!",
    status_noshow: "⚠️ अनुपस्थित दर्ज। कृपया रिसेप्शन काउंटर पर संपर्क करें।",

    // Staff Console
    staff_heading: "ओपीडी कतार बोर्ड",
    btn_call_next: "📢 अगला मरीज बुलाएं",
    btn_issue_walkin: "➕ वॉक-इन टोकन जारी करें",
    active_doctors: "उपस्थित डॉक्टर",
    waiting_patients: "कतार में प्रतीक्षारत",
    called_patients: "केबिन में मरीज",
    done_today: "आज देखे गए मरीज",
    avg_service: "औसत परामर्श समय",
    capacity_warning: "⚠️ भारी भीड़: प्रतीक्षा समय घटाने हेतु अतिरिक्त डॉक्टर सक्रिय करें।",
    action_mark_done: "पूर्ण",
    action_mark_noshow: "अनुपस्थित",
    action_set_priority: "प्राथमिकता",

    // Simulation
    sim_heading: "ओपीडी भीड़ और प्रतीक्षा समय सिमुलेटर",
    sim_sub: "तुलना करें: बिना बारी (सुबह 4 बजे की भीड़) बनाम बारी प्रणाली (समयबद्ध आगमन)।",
    sim_param_patients: "प्रतिदिन मरीज संख्या",
    sim_param_doctors: "सक्रिय डॉक्टर काउंटर",
    sim_param_adherence: "बारी समय का पालन करने वाले",
    sim_btn_run: "सिमुलेशन चलाएं",
    sim_metric_wait_red: "औसत प्रतीक्षा में कमी",
    sim_metric_crowd_red: "हॉल की भीड़ में कमी",
    sim_metric_hours_saved: "बचाया गया समय (घंटे)",
    sim_chart_title: "ओपीडी हॉल में समय अनुसार भीड़ का ग्राफ",

    minutes: "मिनट",
    patients: "मरीज",
    close: "बंद करें",
    loading: "लोड हो रहा है...",
  },

  mr: {
    app_title: "बारी (Baari)",
    tagline: "आपल्या वेळेवर या, पहाटे ४ वाजता नाही.",
    nav_patient: "🎫 रुग्ण टोकन",
    nav_staff: "📋 कर्मचारी कन्सोल",
    nav_sim: "📊 गर्दी सिम्युलेटर",
    nav_admin: "⚙️ रुग्णालय व्यवस्थापन",
    nav_login: "🔐 कर्मचारी / अ‍ॅडमिन लॉगिन",
    nav_logout: "लॉगआउट",

    // Kiosk
    kiosk_heading: "ओपीडी टोकन मिळवा",
    kiosk_sub: "बोलून किंवा लिहून आपला नंबर मिळवा. स्मार्टफोन अ‍ॅपची गरज नाही.",
    voice_mic_idle: "बोलून टोकन घ्या (माइक दाबा)",
    voice_mic_recording: "ऐकत आहोत... आपले नाव व त्रास सांगा",
    voice_mic_processing: "आवाज तपासत आहोत...",
    voice_mic_help: "उदा: 'माझे नाव सचिन पाटील आहे, मला ताप आहे' किंवा 'हाडांच्या डॉक्टरांना दाखवायचे आहे'",
    or_type: "— किंवा खालील माहिती भरा —",
    label_name: "रुग्णाचे नाव *",
    label_phone: "मोबाईल नंबर (ऐच्छिक)",
    label_dept: "विभाग निवडा *",
    btn_request_token: "टोकन आणि येण्याची वेळ मिळवा",

    // Departments
    dept_G: "सामान्य औषधोपचार (General Medicine)",
    dept_O: "अस्थिरोग व हाडांचे विकार (Orthopedics)",
    dept_Y: "स्त्रीरोग व प्रसूती (Gynecology)",
    dept_P: "बालरोग विभाग (Pediatrics)",

    // Token Modal / Tracker
    token_issued_title: "आपली बारी (टोकन) निश्चित झाली!",
    token_number_label: "टोकन नंबर",
    token_pin_label: "गुप्त ४-अंकी पिन (जपून ठेवा):",
    token_pin_hint: "स्थिती तपासण्यासाठी हा पिन लिहून किंवा लक्षात ठेवा.",
    token_est_wait: "अंदाजे प्रतीक्षा वेळ",
    token_arrive_at: "रुग्णालयात पोहोचण्याची वेळ",
    btn_listen_token: "🔊 टोकन व पिन आवाजात ऐका",
    btn_track_live: "थेट रांगेची स्थिती तपासा",

    // Live Tracking
    track_heading: "आपल्या बारीची थेट स्थिती तपासा",
    track_sub: "टोकन नंबर आणि पिन टाकून केव्हा यायचे ते पहा.",
    input_token_num_ph: "उदा. G-04",
    input_pin_ph: "४ अंकी पिन",
    btn_check_status: "स्थिती तपासा",
    stepper_1: "टोकन मिळाले",
    stepper_2: "घरी विश्रांती",
    stepper_3: "रुग्णालयात निघा",
    stepper_4: "डॉक्टरांकडे",

    travel_slider_label: "घरापासून रुग्णालयाचे अंतर:",
    travel_min_suffix: "मिनिटांचा प्रवास",

    // Status texts
    status_come_now: "🟢 आत्ताच या! कृपया आपल्या विभागाच्या प्रतीक्षा दालनात पोहोचा.",
    status_wait_home: "🔵 घरी विश्रांती घ्या. आपल्या तपासणीची वेळ साधारणतः:",
    status_called: "🔔 आपली पाळी आली आहे! कृपया डॉक्टरांच्या केबिनमध्ये जा.",
    status_done: "✅ तपासणी पूर्ण झाली. आपणास लवकर आराम मिळो!",
    status_noshow: "⚠️ गैरहजर नोंदवले गेले. कृपया नोंदणी कक्षाशी संपर्क साधा.",

    // Staff Console
    staff_heading: "ओपीडी रांग फलक",
    btn_call_next: "📢 पुढील रुग्ण बोलवा",
    btn_issue_walkin: "➕ वॉक-इन टोकन द्या",
    active_doctors: "उपस्थित डॉक्टर",
    waiting_patients: "रांगेतील रुग्ण",
    called_patients: "केबिनमधील रुग्ण",
    done_today: "आज तपासलेले रुग्ण",
    avg_service: "सरासरी तपासणी वेळ",
    capacity_warning: "⚠️ प्रचंड गर्दी: प्रतीक्षा वेळ कमी करण्यासाठी अतिरिक्त डॉक्टर सुरू करा.",
    action_mark_done: "झाले",
    action_mark_noshow: "गैरहजर",
    action_set_priority: "प्राधान्य",

    // Simulation
    sim_heading: "ओपीडी गर्दी व प्रतीक्षा वेळ सिम्युलेटर",
    sim_sub: "तुलना: बारी शिवाय (पहाटे ४ ची अफाट गर्दी) विरूद्ध बारी प्रणाली (टप्प्याटप्प्याने आगमन).",
    sim_param_patients: "दररोजचे रुग्ण",
    sim_param_doctors: "कार्यरत डॉक्टर काउंटर",
    sim_param_adherence: "बारी वेळेचे पालन करणारे",
    sim_btn_run: "सिम्युलेशन चालवा",
    sim_metric_wait_red: "सरासरी प्रतीक्षा वेळेत घट",
    sim_metric_crowd_red: "दालनातील कमाल गर्दीत घट",
    sim_metric_hours_saved: "वाचलेले एकूण तास",
    sim_chart_title: "वेळेनुसार दालनातील गर्दीचा आलेख",

    minutes: "मिनिटे",
    patients: "रुग्ण",
    close: "बंद करा",
    loading: "लोड होत आहे...",
  },
};

// Global language state
let currentLang = localStorage.getItem("baari_lang") || "en";

function t(key) {
  if (I18N[currentLang] && I18N[currentLang][key]) {
    return I18N[currentLang][key];
  }
  if (I18N.en[key]) {
    return I18N.en[key];
  }
  return key;
}

function setLanguage(lang) {
  if (!I18N[lang]) return;
  currentLang = lang;
  localStorage.setItem("baari_lang", lang);
  updatePageTranslations();
}

function updatePageTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });

  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const key = el.getAttribute("data-i18n-ph");
    if (key) {
      el.placeholder = t(key);
    }
  });

  const langSelect = document.getElementById("lang-select");
  if (langSelect) langSelect.value = currentLang;
}
