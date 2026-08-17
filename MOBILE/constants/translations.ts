export type LanguageCode = 'en' | 'hi' | 'mr';

export const translations = {
  en: {
    // Language Selection
    select_language: 'Select Preferred Language',
    choose_language_desc: 'Choose your language to continue with PatrolSync Field Officer App',
    continue: 'Continue',
    
    // Login
    login_title: 'PatrolSync FO',
    login_subtitle: 'Field Officer Sign In',
    emp_id_or_mobile: 'Employee ID / Mobile Number',
    emp_id_placeholder: 'e.g., EMP001 or 9876543210',
    password: 'Password',
    password_placeholder: 'Enter password',
    sign_in: 'Sign In',
    authenticating: 'Authenticating...',
    invalid_credentials: 'Invalid credentials. Please check Employee ID/Mobile or password.',

    // Navigation & Tabs
    dashboard: 'Dashboard',
    my_sites: 'My Sites',
    attendance: 'Attendance',
    profile: 'Profile',

    // Dashboard
    welcome_back: 'Welcome back,',
    field_officer: 'Field Officer',
    quick_actions: 'Quick Actions',
    mark_attendance: 'Mark Attendance',
    view_sites: 'View Assigned Sites',
    start_visit: 'Start New Visit',
    planned_visits: 'Planned Visits Today',
    no_planned_visits: 'No planned visits scheduled for today.',
    recent_activity: 'Recent Activity',

    // Attendance
    duty_status: 'Duty Status',
    checked_in: 'Checked In',
    checked_out: 'Checked Out',
    check_in_now: 'Check In',
    check_out_now: 'Check Out',
    getting_location: 'Acquiring GPS location...',
    location_required: 'GPS Location is required for attendance marking.',
    regularize: 'Regularize Attendance',
    shift: 'Shift',
    duty_type: 'Duty Type',
    remarks: 'Remarks',
    submit: 'Submit',

    // Sites & Visits
    assigned_sites: 'Assigned Sites',
    search_sites: 'Search sites or clients...',
    select_visit_type: 'Select Visit Type',
    day_visit: 'Day Visit',
    night_visit: 'Night Visit',
    general_visit: 'General Visit',
    day_visit_desc: 'Conduct a scheduled day visit report & guard inspection.',
    night_visit_desc: 'Conduct a night round inspection & guard briefing.',
    general_visit_desc: 'Conduct a general audit or surprise visit report.',

    // Form Steps
    step_general_info: 'General Info',
    step_guards: 'Guards Inspection',
    step_checklist: 'Checklist & Obs',
    step_feedback: 'Customer Feedback',
    step_suggestions: 'Suggestions',
    step_review: 'Review & Submit',
    next: 'Next',
    previous: 'Previous',

    // Profile & Logout
    profile_info: 'Officer Information',
    employee_code: 'Employee Code',
    role: 'Role',
    assigned_site: 'Assigned Site',
    change_language: 'Change Language',
    logout: 'Log Out',
    confirm_logout: 'Are you sure you want to log out?',
  },

  hi: {
    // Language Selection
    select_language: 'अपनी भाषा चुनें',
    choose_language_desc: 'पेट्रोलसिंक फील्ड ऑफिसर ऐप का उपयोग करने के लिए भाषा चुनें',
    continue: 'आगे बढ़ें',
    
    // Login
    login_title: 'पेट्रोलसिंक एफओ',
    login_subtitle: 'फील्ड ऑफिसर लॉगिन',
    emp_id_or_mobile: 'कर्मचारी आईडी / मोबाइल नंबर',
    emp_id_placeholder: 'उदा. EMP001 या 9876543210',
    password: 'पासवर्ड',
    password_placeholder: 'पासवर्ड दर्ज करें',
    sign_in: 'लॉग इन करें',
    authenticating: 'प्रमाणित हो रहा है...',
    invalid_credentials: 'अमान्य क्रेडेंशियल। कृपया सही आईडी और पासवर्ड दर्ज करें।',

    // Navigation & Tabs
    dashboard: 'डैशबोर्ड',
    my_sites: 'मेरी साइटें',
    attendance: 'उपस्थिति',
    profile: 'प्रोफाइल',

    // Dashboard
    welcome_back: 'नमस्ते,',
    field_officer: 'फील्ड ऑफिसर',
    quick_actions: 'त्वरित कार्य',
    mark_attendance: 'उपस्थिति दर्ज करें',
    view_sites: 'आवंटित साइटें देखें',
    start_visit: 'नई विज़िट शुरू करें',
    planned_visits: 'आज की योजनाबद्ध विज़िट',
    no_planned_visits: 'आज के लिए कोई योजनाबद्ध विज़िट नहीं है।',
    recent_activity: 'हाल की गतिविधि',

    // Attendance
    duty_status: 'ड्यूटी स्थिति',
    checked_in: 'चेक-इन पूर्ण',
    checked_out: 'चेक-आउट पूर्ण',
    check_in_now: 'चेक-इन करें',
    check_out_now: 'चेक-आउट करें',
    getting_location: 'जीपीएस स्थान प्राप्त हो रहा है...',
    location_required: 'उपस्थिति के लिए जीपीएस स्थान आवश्यक है।',
    regularize: 'उपस्थिति नियमित करें',
    shift: 'शिफ्ट',
    duty_type: 'ड्यूटी का प्रकार',
    remarks: 'टिप्पणियाँ',
    submit: 'जमा करें',

    // Sites & Visits
    assigned_sites: 'आवंटित साइटें',
    search_sites: 'साइट या क्लाइंट खोजें...',
    select_visit_type: 'विज़िट प्रकार चुनें',
    day_visit: 'दिन की विज़िट',
    night_visit: 'रात की विज़िट',
    general_visit: 'सामान्य विज़िट',
    day_visit_desc: 'दिन की शिफ्ट में विज़िट रिपोर्ट और गार्ड निरीक्षण करें।',
    night_visit_desc: 'रात की राउंड निरीक्षण और गार्ड ब्रीफिंग करें।',
    general_visit_desc: 'सामान्य ऑडिट या सरप्राइज विज़िट रिपोर्ट बनाएं।',

    // Form Steps
    step_general_info: 'सामान्य जानकारी',
    step_guards: 'गार्ड निरीक्षण',
    step_checklist: 'चेकलिस्ट और अवलोकन',
    step_feedback: 'ग्राहक प्रतिक्रिया',
    step_suggestions: 'सुझाव',
    step_review: 'समीक्षा और सबमिट',
    next: 'आगे',
    previous: 'पीछे',

    // Profile & Logout
    profile_info: 'ऑफिसर की जानकारी',
    employee_code: 'कर्मचारी कोड',
    role: 'पद',
    assigned_site: 'आवंटित साइट',
    change_language: 'भाषा बदलें',
    logout: 'लॉग आउट',
    confirm_logout: 'क्या आप लॉग आउट करना चाहते हैं?',
  },

  mr: {
    // Language Selection
    select_language: 'आपली भाषा निवडा',
    choose_language_desc: 'पेट्रोलसिंक फील्ड ऑफिसर ॲप वापरण्यासाठी भाषा निवडा',
    continue: 'पुढे जा',
    
    // Login
    login_title: 'पेट्रोलसिंक एफओ',
    login_subtitle: 'फील्ड ऑफिसर लॉगिन',
    emp_id_or_mobile: 'कर्मचारी आयडी / मोबाईल नंबर',
    emp_id_placeholder: 'उदा. EMP001 किंवा 9876543210',
    password: 'पासवर्ड',
    password_placeholder: 'पासवर्ड प्रविष्ट करा',
    sign_in: 'लॉग इन करा',
    authenticating: 'प्रमाणित करत आहे...',
    invalid_credentials: 'अवैध माहिती. कृपया योग्य आयडी आणि पासवर्ड टाका.',

    // Navigation & Tabs
    dashboard: 'डॅशबोर्ड',
    my_sites: 'माझ्या साइट्स',
    attendance: 'हजेरी',
    profile: 'प्रोफाइल',

    // Dashboard
    welcome_back: 'नमस्कार,',
    field_officer: 'फील्ड ऑफिसर',
    quick_actions: 'जलद कृती',
    mark_attendance: 'हजेरी नोंदवा',
    view_sites: 'नियुक्त साइट्स पहा',
    start_visit: 'नवी भेट सुरू करा',
    planned_visits: 'आजच्या नियोजित भेटी',
    no_planned_visits: 'आजसाठी कोणतीही नियोजित भेट नाही.',
    recent_activity: 'अलीकडील हालचाली',

    // Attendance
    duty_status: 'ड्यूटी स्थिती',
    checked_in: 'चेक-इन झाले',
    checked_out: 'चेक-आऊट झाले',
    check_in_now: 'चेक-इन करा',
    check_out_now: 'चेक-आऊट करा',
    getting_location: 'जीपीएस स्थान मिळवत आहे...',
    location_required: 'हजेरीसाठी जीपीएस स्थान आवश्यक आहे.',
    regularize: 'हजेरी नियमित करा',
    shift: 'शिफ्ट',
    duty_type: 'ड्यूटी प्रकार',
    remarks: 'शेरा',
    submit: 'सबमिट करा',

    // Sites & Visits
    assigned_sites: 'नियुक्त साइट्स',
    search_sites: 'साइट किंवा क्लायंट शोधा...',
    select_visit_type: 'भेटीचा प्रकार निवडा',
    day_visit: 'दिवसाची भेट',
    night_visit: 'रात्रीची भेट',
    general_visit: 'सामान्य भेट',
    day_visit_desc: 'दिवसाच्या शिफ्टमध्ये भेट आणि गार्ड तपासणी करा.',
    night_visit_desc: 'रात्रीची गस्त आणि गार्ड ब्रीफिंग करा.',
    general_visit_desc: 'सामान्य ऑडिट किंवा सरप्राइज भेट रिपोर्ट नोंदवा.',

    // Form Steps
    step_general_info: 'सामान्य माहिती',
    step_guards: 'गार्ड तपासणी',
    step_checklist: 'चेकलिस्ट आणि निरीक्षण',
    step_feedback: 'ग्राहक अभिप्राय',
    step_suggestions: 'सल्ला आणि शेरा',
    step_review: 'तपासणी आणि सबमिट',
    next: 'पुढे',
    previous: 'मागे',

    // Profile & Logout
    profile_info: 'ऑफिसर माहिती',
    employee_code: 'कर्मचारी कोड',
    role: 'पद',
    assigned_site: 'नियुक्त साइट',
    change_language: 'भाषा बदला',
    logout: 'लॉग आऊट',
    confirm_logout: 'तुम्हाला नक्की लॉग आऊट करायचे आहे का?',
  },
};
