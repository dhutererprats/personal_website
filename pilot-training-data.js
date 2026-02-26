window.PILOT_TRAINING_DATA = {
  version: "2026-02-26",
  title: "Pilot Training - PHAK Core",
  sources: [
    {
      label: "FAA - Pilot's Handbook of Aeronautical Knowledge",
      url: "https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak"
    },
    {
      label: "FAA - Aeronautical Information Manual",
      url: "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/"
    },
    {
      label: "FAA - Safety Team and Risk Management",
      url: "https://www.faasafety.gov/"
    }
  ],
  chapters: [
    {
      id: "phak-intro",
      name: "Chapter 1 - Introduction to Flying",
      cards: [
        { id: "phak-001", q: "What are the four fundamentals of flight?", a: "Straight-and-level, turns, climbs, and descents." },
        { id: "phak-002", q: "What is a primary reason checklists are mandatory in aviation?", a: "They reduce omissions and standardize critical procedures." },
        { id: "phak-003", q: "What does PIC stand for?", a: "Pilot in Command." },
        { id: "phak-004", q: "What is sterile cockpit discipline conceptually?", a: "Avoiding nonessential conversation during critical phases of flight." },
        { id: "phak-005", q: "Why is flight planning part of risk management?", a: "It anticipates weather, fuel, performance, and alternate options before departure." },
        { id: "phak-006", q: "What does personal minimums mean?", a: "Pilot-defined weather and operational limits stricter than regulations." },
        { id: "phak-007", q: "What is the purpose of a preflight briefing?", a: "To align mission goals, hazards, roles, and contingency actions." }
      ]
    },
    {
      id: "phak-aerodynamics",
      name: "Chapter 2 - Aerodynamics of Flight",
      cards: [
        { id: "phak-008", q: "Lift equation in standard form.", a: "L = 0.5 * rho * V^2 * S * CL." },
        { id: "phak-009", q: "Drag equation in standard form.", a: "D = 0.5 * rho * V^2 * S * CD." },
        { id: "phak-010", q: "What is induced drag mainly associated with?", a: "Lift generation and wingtip vortex effects." },
        { id: "phak-011", q: "What is parasite drag composed of?", a: "Form drag, skin-friction drag, and interference drag." },
        { id: "phak-012", q: "What causes an aerodynamic stall?", a: "Angle of attack exceeds critical value, causing flow separation and lift loss." },
        { id: "phak-013", q: "Why does increased bank angle require more lift in level turn?", a: "Only the vertical component of lift supports weight." },
        { id: "phak-014", q: "Define load factor.", a: "n = Lift / Weight, expressed in g units." }
      ]
    },
    {
      id: "phak-controls",
      name: "Chapter 3 - Flight Controls",
      cards: [
        { id: "phak-015", q: "Primary controls and axes mapping.", a: "Ailerons-roll-longitudinal axis, elevator-pitch-lateral axis, rudder-yaw-vertical axis." },
        { id: "phak-016", q: "What is adverse yaw?", a: "Yaw opposite the direction of roll input due to differential drag." },
        { id: "phak-017", q: "How is adverse yaw commonly mitigated?", a: "Coordinated rudder input with aileron input." },
        { id: "phak-018", q: "What does elevator trim primarily do?", a: "Reduces control forces required to hold a pitch attitude." },
        { id: "phak-019", q: "What does the turn coordinator/skid-slip indicator support?", a: "Maintaining coordinated flight by centering the ball." },
        { id: "phak-020", q: "What is a stabilized approach conceptually?", a: "Predictable, controlled approach with correct speed, descent, and configuration." },
        { id: "phak-021", q: "Why is cross-control at low speed risky?", a: "It can increase spin-entry risk if stall occurs." }
      ]
    },
    {
      id: "phak-systems",
      name: "Chapter 4 - Aircraft Systems",
      cards: [
        { id: "phak-022", q: "What does a pitot-static system provide?", a: "Airspeed, altitude, and vertical speed sensing inputs." },
        { id: "phak-023", q: "What instrument uses only pitot pressure and static pressure?", a: "Airspeed indicator." },
        { id: "phak-024", q: "Why is carburetor icing possible at moderate temperatures?", a: "Pressure drop and fuel vaporization can lower intake temperature below freezing." },
        { id: "phak-025", q: "Purpose of magnetos in piston aircraft.", a: "Provide independent ignition source for spark plugs." },
        { id: "phak-026", q: "What is alternator failure typical immediate action?", a: "Reduce electrical load and follow aircraft checklist procedures." },
        { id: "phak-027", q: "Why is fuel contamination check part of preflight?", a: "Water or debris can cause engine power loss." },
        { id: "phak-028", q: "What is flap deployment trade-off?", a: "Higher lift and drag, enabling steeper/slower approach." }
      ]
    },
    {
      id: "phak-performance",
      name: "Chapter 5 - Flight Manuals and Performance",
      cards: [
        { id: "phak-029", q: "What does POH stand for?", a: "Pilot's Operating Handbook." },
        { id: "phak-030", q: "What is density altitude?", a: "Pressure altitude corrected for nonstandard temperature." },
        { id: "phak-031", q: "Why does high density altitude increase takeoff distance?", a: "Lower air density reduces thrust, lift, and propeller efficiency." },
        { id: "phak-032", q: "What is accelerate-stop distance conceptually?", a: "Distance to accelerate and then safely stop if takeoff is aborted." },
        { id: "phak-033", q: "How should performance charts be used?", a: "With current conditions and conservatism for safety margins." },
        { id: "phak-034", q: "What is service ceiling?", a: "Altitude where maximum steady climb rate falls to a specified small value (commonly 100 fpm for piston aircraft)." },
        { id: "phak-035", q: "Why calculate landing distance before departure?", a: "To ensure destination runway and conditions remain within limits." }
      ]
    },
    {
      id: "phak-weight-balance",
      name: "Chapter 6 - Weight and Balance",
      cards: [
        { id: "phak-036", q: "Moment formula in weight and balance.", a: "Moment = Weight * Arm." },
        { id: "phak-037", q: "What is center of gravity (CG)?", a: "The point where aircraft weight is considered concentrated." },
        { id: "phak-038", q: "Why is aft CG potentially hazardous?", a: "It can reduce longitudinal stability and stall recovery margin." },
        { id: "phak-039", q: "Why is forward CG potentially hazardous?", a: "It can increase stall speed and required control force." },
        { id: "phak-040", q: "If 40 lb is moved 20 in aft, how much moment change occurs?", a: "800 lb-in increase in aft moment." },
        { id: "phak-041", q: "How is new CG found conceptually after loading change?", a: "Sum moments divided by total weight." },
        { id: "phak-042", q: "What does useful load include?", a: "Fuel, passengers, baggage, and pilot beyond empty weight." }
      ]
    },
    {
      id: "phak-navigation",
      name: "Chapter 7 - Navigation",
      cards: [
        { id: "phak-043", q: "Difference between heading and track.", a: "Heading is nose direction; track is actual path over ground." },
        { id: "phak-044", q: "What is wind correction angle?", a: "The heading offset needed to hold desired ground track." },
        { id: "phak-045", q: "What does VOR stand for?", a: "VHF Omnidirectional Range." },
        { id: "phak-046", q: "What is a VOR radial?", a: "A magnetic bearing line extending outward from a VOR station." },
        { id: "phak-047", q: "What does DME provide?", a: "Slant-range distance from aircraft to DME station." },
        { id: "phak-048", q: "What is dead reckoning?", a: "Position estimate from course, speed, time, and wind correction." },
        { id: "phak-049", q: "Why verify GPS with other data sources when possible?", a: "Cross-checking reduces single-source navigation error risk." }
      ]
    },
    {
      id: "phak-weather-theory",
      name: "Chapter 8 - Weather Theory",
      cards: [
        { id: "phak-050", q: "What is atmospheric pressure?", a: "Force per unit area exerted by air column above a point." },
        { id: "phak-051", q: "What does a temperature-dew point spread near zero suggest?", a: "High chance of low cloud or fog formation." },
        { id: "phak-052", q: "What is a front in meteorology?", a: "Boundary between two air masses with different properties." },
        { id: "phak-053", q: "Why are unstable air masses often associated with turbulence?", a: "Vertical motion and convection are stronger." },
        { id: "phak-054", q: "What is wind shear?", a: "Rapid change in wind speed or direction over short distance." },
        { id: "phak-055", q: "What is a microburst?", a: "Localized intense downdraft producing hazardous low-level wind shear." },
        { id: "phak-056", q: "Which clouds are most associated with severe convection?", a: "Cumulonimbus clouds." }
      ]
    },
    {
      id: "phak-weather-services",
      name: "Chapter 9 - Aviation Weather Services",
      cards: [
        { id: "phak-057", q: "What is a METAR?", a: "Routine coded airport weather observation report." },
        { id: "phak-058", q: "What is a TAF?", a: "Terminal Aerodrome Forecast for expected airport weather." },
        { id: "phak-059", q: "What does SIGMET generally indicate?", a: "Significant weather hazards that can affect all aircraft." },
        { id: "phak-060", q: "What does AIRMET generally indicate?", a: "Weather conditions potentially hazardous to light aircraft." },
        { id: "phak-061", q: "What is PIREP?", a: "Pilot weather report of observed in-flight conditions." },
        { id: "phak-062", q: "Why check NOTAMs before flight?", a: "They include time-critical operational restrictions and hazards." },
        { id: "phak-063", q: "What does ATIS provide?", a: "Continuous broadcast of airport weather and operational information." }
      ]
    },
    {
      id: "phak-airspace",
      name: "Chapter 10 - Airspace",
      cards: [
        { id: "phak-064", q: "Purpose of Class B airspace.", a: "Protect high-density traffic around major airports with strict ATC control." },
        { id: "phak-065", q: "Purpose of Class C airspace.", a: "Manage moderate-density traffic with radar service and two-way communication." },
        { id: "phak-066", q: "Purpose of Class D airspace.", a: "Protect towered airport operations, generally at lower traffic volume." },
        { id: "phak-067", q: "What is Class G airspace?", a: "Uncontrolled airspace where ATC separation is not normally provided." },
        { id: "phak-068", q: "Why are TFRs important?", a: "Temporary Flight Restrictions can prohibit or limit operations in specific areas." },
        { id: "phak-069", q: "What is special use airspace conceptually?", a: "Airspace with specific activity constraints, such as military or hazardous operations." },
        { id: "phak-070", q: "What is required before entering controlled airspace?", a: "Meet the communication, equipment, and clearance requirements applicable to that specific airspace class." }
      ]
    },
    {
      id: "phak-airport-ops",
      name: "Chapter 11 - Airport Operations",
      cards: [
        { id: "phak-071", q: "What is runway incursion?", a: "Incorrect presence of aircraft, vehicle, or person on protected runway surface." },
        { id: "phak-072", q: "Why are hold-short instructions read back?", a: "To confirm runway and taxi restrictions and prevent incursions." },
        { id: "phak-073", q: "What is a displaced threshold?", a: "Threshold not located at runway physical beginning for landing operations." },
        { id: "phak-074", q: "What is CTAF used for?", a: "Traffic advisories and coordination at non-towered airports." },
        { id: "phak-075", q: "Why is wake turbulence spacing important?", a: "Vortices from larger aircraft can upset following aircraft." },
        { id: "phak-076", q: "What is stabilized taxi conceptually?", a: "Controlled speed and path with continuous situational awareness and checklist discipline." },
        { id: "phak-077", q: "What is go-around decision principle?", a: "If approach is unstable or unsafe, discontinue landing and reattempt." }
      ]
    },
    {
      id: "phak-aeromedical",
      name: "Chapter 12 - Aeromedical Factors",
      cards: [
        { id: "phak-078", q: "What does IMSAFE stand for?", a: "Illness, Medication, Stress, Alcohol, Fatigue, Emotion." },
        { id: "phak-079", q: "What is hypoxia?", a: "Inadequate oxygen supply to body tissues." },
        { id: "phak-080", q: "What is hyperventilation in flight context?", a: "Breathing rate/depth too high, lowering CO2 and causing symptoms." },
        { id: "phak-081", q: "What causes middle-ear barotrauma risk during descent?", a: "Pressure cannot equalize across eardrum quickly enough." },
        { id: "phak-082", q: "Why is dehydration a flight safety issue?", a: "It impairs cognition, decision-making, and physical tolerance." },
        { id: "phak-083", q: "Why is fatigue hazardous in cockpit operations?", a: "It slows reaction time and degrades attention and judgment." },
        { id: "phak-084", q: "Why avoid flying with severe sinus congestion?", a: "Pressure equalization problems can cause pain and distraction." }
      ]
    },
    {
      id: "phak-adm-risk",
      name: "Chapter 13 - ADM and Risk Management",
      cards: [
        { id: "phak-085", q: "What does ADM stand for?", a: "Aeronautical Decision Making." },
        { id: "phak-086", q: "What does PAVE stand for in risk assessment?", a: "Pilot, Aircraft, enVironment, External pressures." },
        { id: "phak-087", q: "What does the 5P model include?", a: "Plan, Plane, Pilot, Passengers, Programming." },
        { id: "phak-088", q: "Purpose of a go/no-go gate before departure.", a: "Applies objective criteria to reduce emotional or schedule-driven bias." },
        { id: "phak-089", q: "What is plan continuation bias?", a: "Tendency to continue original plan despite changing risk conditions." },
        { id: "phak-090", q: "Why is alternate planning essential?", a: "It preserves safe options when weather or aircraft status changes." },
        { id: "phak-091", q: "What is SRM in cockpit operations?", a: "Single-Pilot Resource Management: task, automation, and workload management." }
      ]
    },
    {
      id: "phak-night-ops",
      name: "Chapter 14 - Night and Cross-Country Operations",
      cards: [
        { id: "phak-092", q: "Why use off-center viewing at night?", a: "Rods are more sensitive outside the fovea in low light." },
        { id: "phak-093", q: "What is black-hole illusion in night approaches?", a: "Lack of visual references can make pilot perceive being too high." },
        { id: "phak-094", q: "Why are weather minimums often increased personally at night?", a: "Lower visual cues and higher disorientation risk increase workload." },
        { id: "phak-095", q: "What is fuel reserve planning objective for night cross-country?", a: "Maintain conservative margin for delays, reroutes, and unexpected headwinds." },
        { id: "phak-096", q: "Why verify lighting systems before night operations?", a: "Navigation/landing light failures significantly increase risk at night." },
        { id: "phak-097", q: "What is VFR-on-top misconception risk?", a: "Surface conditions can deteriorate below, reducing legal/safe descent options." },
        { id: "phak-098", q: "How does autokinesis affect night flying?", a: "Staring at a single light can create illusion of motion." }
      ]
    },
    {
      id: "phak-multistep",
      name: "Chapter 15 - Applied Multi-Step Scenarios",
      cards: [
        { id: "phak-099", q: "If TAS is 120 kt, wind correction is +8 deg right, and true course is 090 deg, what true heading is flown?", a: "098 deg true heading." },
        { id: "phak-100", q: "A flight leg is 180 NM at 120 kt GS. What is enroute time?", a: "1.5 hours (1 hour 30 minutes)." },
        { id: "phak-101", q: "Fuel burn is 9 gph for a 2.2-hour leg. Fuel required without reserve?", a: "19.8 gallons." },
        { id: "phak-102", q: "If pressure altitude is 5,000 ft and temperature is much above standard, what happens to density altitude?", a: "Density altitude increases above pressure altitude." },
        { id: "phak-103", q: "An aircraft weighs 2,200 lb and total moment is 84,700 lb-in. What is CG arm?", a: "CG arm = 84,700 / 2,200 = 38.5 inches." },
        { id: "phak-104", q: "Crosswind is 12 kt and headwind is 8 kt on approach. Which is usually more limiting?", a: "Crosswind component, because it can exceed demonstrated or personal limits." },
        { id: "phak-105", q: "On final, you are high, fast, and unstable by 500 ft AGL. Correct decision?", a: "Go around and set up a stabilized approach." }
      ]
    }
  ]
};
