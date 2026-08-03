/* ============================================================================
   LOCAL RADAR - US CITY ATLAS
   ----------------------------------------------------------------------------
   20 US cities, ranked by US Census Bureau population estimates (July 1, 2025).
   Ranks 1-10 first, then 11-20.

   WHAT IS REAL HERE:
     - Every city, neighborhood/district, business, venue and street reference
       is a real place you can look up on a map.
     - Business categories, neighborhoods and rough scale are accurate.

   WHAT IS SIMULATED:
     - All scores, ratings deltas, foot traffic, hiring, rent and risk numbers.
       No live data feed is wired up, so these are deterministic stand-ins that
       give the reasoning engine realistic structured input to analyse.
     - Health scores, DNA, signals and timelines are generated in data.js from
       each business's `health` and `trend` seed, so they never contradict
       each other between panels.

   GRID: districts sit on a 9 x 6 map grid (x 0-8, y 0-5) laid out to loosely
   mirror each city's real geography (north at top, downtown near centre).
============================================================================ */

const CITY_DATA = {

  /* ===== 1. NEW YORK, NY =================================================== */
  'new-york': {
    rank: 1, name: 'New York', state: 'NY', pop: '8,478,072', pulse: 84,
    stats: [ ['Economy',88,'up','green'], ['Hiring',74,'up','green'], ['Construction',69,'up','blue'],
             ['Consumer sentiment',58,'down','red'], ['Competition',96,'up','orange'], ['Commercial rent',93,'up','orange'] ],
    districts: [
      { id:'midtown',   name:'Midtown Manhattan', x:3, y:2, w:2, h:2, pop:'+1.2%', income:'$118k', rent:'$21.50/sqft', score:38, sat:'very high', note:'Office return is still below 2019; every food category is saturated and rent is the highest in the country.' },
      { id:'fidi',      name:'Financial District', x:3, y:4, w:2, h:2, pop:'+5.9%', income:'$156k', rent:'$14.20/sqft', score:79, sat:'medium',    note:'Office-to-residential conversions are turning a weekday district into a 7-day one; evening dining is underserved.' },
      { id:'harlem',    name:'Harlem',            x:3, y:0, w:2, h:1, pop:'+2.4%', income:'$62k',  rent:'$6.80/sqft',  score:81, sat:'low',        note:'Strong population growth against thin sit-down restaurant supply north of 125th Street.' },
      { id:'ues',       name:'Upper East Side',   x:5, y:1, w:2, h:2, pop:'+0.6%', income:'$142k', rent:'$11.40/sqft', score:47, sat:'high',       note:'Wealthy and stable but slow-growing; only premium or specialist formats can clear the rent.' },
      { id:'williamsburg', name:'Williamsburg',   x:6, y:3, w:2, h:2, pop:'+4.1%', income:'$121k', rent:'$9.60/sqft',  score:72, sat:'high',       note:'Highest bar and cafe density in Brooklyn; the opportunity has moved from food to services and fitness.' },
      { id:'bushwick',  name:'Bushwick',          x:7, y:1, w:2, h:2, pop:'+3.7%', income:'$71k',  rent:'$5.10/sqft',  score:88, sat:'low',        note:'Rent is roughly half of Williamsburg with comparable foot traffic growth - the strongest risk-adjusted entry in the city.' },
      { id:'astoria',   name:'Astoria',           x:6, y:0, w:2, h:1, pop:'+2.9%', income:'$89k',  rent:'$5.90/sqft',  score:84, sat:'low',        note:'Dense, transit-rich and family-forming; bakery and grab-and-go coverage per capita is well below the borough average.' },
      { id:'motthaven', name:'Mott Haven',        x:0, y:1, w:3, h:3, pop:'+6.2%', income:'$41k',  rent:'$3.40/sqft',  score:66, sat:'very low',   note:'Fastest housing growth in the city and the cheapest ground-floor retail, but discretionary spend per household is still thin.' }
    ],
    businesses: [
      { id:'katzs',   name:"Katz's Delicatessen", emoji:'\u{1F96A}', category:'Delicatessen', hood:'Lower East Side', addr:'205 E Houston St',
        rating:4.5, reviews:38400, employees:120, priceTier:'$$$', trend:'stable', health:88, closeRisk:6,
        comp:[ ['2nd Ave Deli','no tourist queue|table service|kosher certification'], ['Russ & Daughters','appetizing counter|catering arm|cafe format'] ] },
      { id:'levain',  name:'Levain Bakery', emoji:'\u{1F36A}', category:'Bakery', hood:'Upper West Side', addr:'351 Amsterdam Ave',
        rating:4.7, reviews:14200, employees:64, priceTier:'$$', trend:'rising', health:93, closeRisk:4,
        comp:[ ['Magnolia Bakery','airport concessions|national shipping|brand recognition'], ['Insomnia Cookies','open until 3am|campus delivery|lower price point'] ] },
      { id:'joespizza', name:"Joe's Pizza", emoji:'\u{1F355}', category:'Pizzeria', hood:'Greenwich Village', addr:'7 Carmine St',
        rating:4.6, reviews:11800, employees:28, priceTier:'$', trend:'rising', health:86, closeRisk:9,
        comp:[ ['Prince Street Pizza','square slice niche|heavy social reach|multiple locations'], ["John's of Bleecker",'full sit-down|coal oven|group bookings'] ] },
      { id:'russdaughters', name:'Russ & Daughters', emoji:'\u{1F41F}', category:'Specialty grocer', hood:'Lower East Side', addr:'179 E Houston St',
        rating:4.6, reviews:5900, employees:85, priceTier:'$$$', trend:'stable', health:81, closeRisk:11,
        comp:[ ['Zabar\u2019s','uptown catchment|larger grocery range|lower prices'], ['Barney Greengrass','sit-down brunch|neighbourhood loyalty'] ] },
      { id:'peterluger', name:'Peter Luger Steak House', emoji:'\u{1F969}', category:'Steakhouse', hood:'Williamsburg', addr:'178 Broadway',
        rating:4.4, reviews:9800, employees:110, priceTier:'$$$$', trend:'declining', health:61, closeRisk:24,
        comp:[ ['Keens Steakhouse','Midtown expense accounts|stronger reviews|full bar programme'], ['St. Anselm','walk-in friendly|half the ticket|younger crowd'] ] },
      { id:'bluebottlewb', name:'Blue Bottle Coffee', emoji:'\u2615', category:'Coffee shop', hood:'Williamsburg', addr:'160 Berry St',
        rating:4.2, reviews:1650, employees:16, priceTier:'$$', trend:'declining', health:54, closeRisk:31,
        comp:[ ['Devoci\u00f3n','roastery on site|large seating|strong wifi work crowd'], ['Sey Coffee','specialist reputation|lower rent block|wholesale contracts'] ] }
    ],
    news: [
      { title:'City approves office-to-residential conversion of three Financial District towers', src:'Crain\u2019s New York Business \u00b7 3h ago', kind:'housing',
        affected:[ ['Evening dining',31,'up'], ['Grocery',27,'up'], ['Coffee shops',19,'up'], ['Weekday-only delis',-14,'down'] ] },
      { title:'L train weekend service suspended between Manhattan and Bushwick for four months', src:'Gothamist \u00b7 8h ago', kind:'transit',
        affected:[ ['Bushwick bars',-26,'down'], ['Williamsburg retail',-17,'down'], ['Car services',44,'up'], ['Astoria nightlife',12,'up'] ] }
    ],
    events: [
      { name:'Yankees vs. Red Sox', when:'Tonight \u00b7 19:05 \u00b7 Yankee Stadium', attendance:'46,800',
        effects:[ ['Bars in the Bronx','+62%','up'], ['Parking','Full by 17:40','down'], ['Subway crowding','Severe','down'], ['Midtown restaurants','-8%','down'], ['Hotels','+22%','up'] ] },
      { name:'Macy\u2019s Thanksgiving Day Parade route setup', when:'Wednesday \u00b7 06:00 \u00b7 Central Park West', attendance:'3.5M',
        effects:[ ['UWS cafes','+140%','up'], ['Street closures','34 blocks','down'], ['Retail','+58%','up'], ['Delivery times','+27 min','down'], ['Hotels','Sold out','up'] ] }
    ],
    scenarios:[ ['Costco opens in Mott Haven','bigbox'], ['Peter Luger closes its Williamsburg dining room','closure'],
                ['L train shuts down for four months','transit'], ['A 900-unit tower opens in the Financial District','housing'] ],
    insights:[
      'Every deli that survived the last rent cycle on the Lower East Side added either shipping or catering; none of the closures did.',
      'Bushwick has 41% of Williamsburg\u2019s cafe density at 53% of its rent - the widest gap between demand and supply in the five boroughs.',
      'Restaurants within 300m of an L train stop lost 3.1x more weekend traffic during the last service change than those two stops further out.'
    ]
  },

  /* ===== 2. LOS ANGELES, CA ================================================ */
  'los-angeles': {
    rank: 2, name: 'Los Angeles', state: 'CA', pop: '3,878,704', pulse: 76,
    stats: [ ['Economy',72,'down','red'], ['Hiring',64,'down','red'], ['Construction',78,'up','blue'],
             ['Consumer sentiment',61,'down','red'], ['Competition',85,'up','orange'], ['Commercial rent',81,'up','orange'] ],
    districts: [
      { id:'dtla',       name:'Downtown LA',    x:4, y:2, w:2, h:2, pop:'+3.4%', income:'$78k',  rent:'$4.90/sqft', score:58, sat:'medium',    note:'Residential conversions keep adding people, but office vacancy near 30% still suppresses weekday lunch trade.' },
      { id:'silverlake', name:'Silver Lake',    x:5, y:1, w:2, h:1, pop:'+1.9%', income:'$106k', rent:'$6.40/sqft', score:44, sat:'high',       note:'Every third-wave coffee and natural wine slot is filled; new entrants are competing on rent, not concept.' },
      { id:'venice',     name:'Venice',         x:0, y:4, w:2, h:2, pop:'+0.8%', income:'$132k', rent:'$8.70/sqft', score:41, sat:'high',       note:'Premium foot traffic on Abbot Kinney but the highest retail rent west of Downtown and flat resident growth.' },
      { id:'ktown',      name:'Koreatown',      x:3, y:2, w:1, h:2, pop:'+4.6%', income:'$59k',  rent:'$3.80/sqft', score:83, sat:'medium',     note:'Densest neighbourhood in LA County; late-night demand is strong and daytime formats are underbuilt.' },
      { id:'highlandpk', name:'Highland Park',  x:6, y:0, w:2, h:2, pop:'+3.1%', income:'$81k',  rent:'$4.10/sqft', score:87, sat:'low',        note:'Figueroa corridor still has sub-$5 rent with Silver Lake demographics arriving - best entry point in the city.' },
      { id:'echopark',   name:'Echo Park',      x:4, y:1, w:1, h:1, pop:'+2.2%', income:'$88k',  rent:'$5.30/sqft', score:69, sat:'medium',     note:'Steady growth with a young renter base; breakfast and fitness are the thin categories.' },
      { id:'boyleheights', name:'Boyle Heights', x:6, y:2, w:2, h:2, pop:'+1.4%', income:'$52k', rent:'$2.90/sqft', score:74, sat:'low',        note:'Cheapest ground-floor retail in central LA with high street-level foot traffic, though discretionary spend is limited.' },
      { id:'shermanoaks', name:'Sherman Oaks',  x:2, y:0, w:2, h:2, pop:'+1.1%', income:'$114k', rent:'$5.60/sqft', score:63, sat:'medium',     note:'Reliable Valley family spend on Ventura Boulevard; casual dining is crowded but services are not.' }
    ],
    businesses: [
      { id:'grandcentral', name:'Grand Central Market', emoji:'\u{1F3EA}', category:'Food hall', hood:'Downtown LA', addr:'317 S Broadway',
        rating:4.5, reviews:24600, employees:210, priceTier:'$$', trend:'rising', health:84, closeRisk:8,
        comp:[ ['Smorgasburg LA','weekend-only|outdoor format|lower stall fees'], ['ROW DTLA','newer build|parking on site|larger units'] ] },
      { id:'philippes', name:'Philippe the Original', emoji:'\u{1F96A}', category:'Sandwich shop', hood:'Chinatown', addr:'1001 N Alameda St',
        rating:4.4, reviews:12900, employees:70, priceTier:'$', trend:'stable', health:79, closeRisk:12,
        comp:[ ["Cole's French Dip",'full cocktail bar|later hours|events space'], ['Langer\u2019s Deli','stronger reviews|pastrami reputation'] ] },
      { id:'guelaguetza', name:'Guelaguetza', emoji:'\u{1F32E}', category:'Oaxacan restaurant', hood:'Koreatown', addr:'3014 W Olympic Blvd',
        rating:4.6, reviews:8700, employees:75, priceTier:'$$', trend:'rising', health:90, closeRisk:5,
        comp:[ ['Madre Oaxacan','multiple locations|mezcal programme|Westside catchment'], ['Poncho\u2019s Tlayudas','late night|lower prices|street format'] ] },
      { id:'gjelina', name:'Gjelina', emoji:'\u{1F958}', category:'Restaurant', hood:'Venice', addr:'1429 Abbot Kinney Blvd',
        rating:4.4, reviews:6400, employees:95, priceTier:'$$$', trend:'declining', health:64, closeRisk:22,
        comp:[ ['Felix Trattoria','higher rating|pasta specialism|awards coverage'], ['Great White','all-day format|multiple sites|cheaper ticket'] ] },
      { id:'intelligentsiasl', name:'Intelligentsia Coffee', emoji:'\u2615', category:'Coffee shop', hood:'Silver Lake', addr:'3922 W Sunset Blvd',
        rating:4.3, reviews:3900, employees:22, priceTier:'$$', trend:'declining', health:56, closeRisk:28,
        comp:[ ['Dinosaur Coffee','cheaper|younger crowd|better wifi'], ['Maru Coffee','minimalist draw|higher rating|lower rent block'] ] },
      { id:'donnas', name:'Donna\u2019s', emoji:'\u{1F35D}', category:'Italian restaurant', hood:'Highland Park', addr:'5216 York Blvd',
        rating:4.7, reviews:1900, employees:34, priceTier:'$$$', trend:'rising', health:91, closeRisk:7,
        comp:[ ['Deluxe','pizza focus|patio|neighbourhood regulars'], ['Kitchen Mouse','breakfast trade|vegetarian niche'] ] }
    ],
    news: [
      { title:'Metro D Line extension opens three Purple Line stations toward Westwood', src:'LAist \u00b7 5h ago', kind:'transit',
        affected:[ ['Miracle Mile retail',29,'up'], ['Koreatown dining',18,'up'], ['Parking operators',-31,'down'], ['Rideshare',-22,'down'] ] },
      { title:'Film production days in LA fall 18% year over year, FilmLA reports', src:'Los Angeles Times \u00b7 1d ago', kind:'closure',
        affected:[ ['Catering companies',-34,'down'], ['Equipment rental',-41,'down'], ['Hollywood restaurants',-16,'down'], ['Coworking',9,'up'] ] }
    ],
    events: [
      { name:'Dodgers vs. Giants', when:'Tonight \u00b7 19:10 \u00b7 Dodger Stadium', attendance:'52,000',
        effects:[ ['Echo Park bars','+71%','up'], ['Parking','$45 surge','down'], ['Sunset Blvd traffic','Severe','down'], ['Chinatown dining','+38%','up'], ['Rideshare wait','+18 min','down'] ] },
      { name:'Rose Bowl Flea Market', when:'Sunday \u00b7 09:00 \u00b7 Rose Bowl Stadium', attendance:'20,000',
        effects:[ ['Pasadena cafes','+52%','up'], ['Gas stations','+21%','up'], ['Local retail','-7%','down'], ['Parking','Full by 10:00','down'], ['Food trucks','+96%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Boyle Heights','bigbox'], ['Gjelina closes on Abbot Kinney','closure'],
                ['The 405 closes for a weekend of bridge work','transit'], ['A 600-unit conversion opens in Downtown LA','housing'] ],
    insights:[
      'The three highest-rated taquerias in Koreatown all stop serving before 21:00, while demand in the area peaks after 22:00.',
      'Highland Park added cafes 2.6x faster than Silver Lake this year, but rent there is still 36% lower.',
      'Restaurants that lost a nearby production stage saw lunch covers fall within five weeks - faster than any other demand shock tracked.'
    ]
  },

  /* ===== 3. CHICAGO, IL ==================================================== */
  'chicago': {
    rank: 3, name: 'Chicago', state: 'IL', pop: '2,721,308', pulse: 73,
    stats: [ ['Economy',69,'down','red'], ['Hiring',66,'down','red'], ['Construction',62,'up','blue'],
             ['Consumer sentiment',57,'down','red'], ['Competition',79,'up','orange'], ['Commercial rent',58,'flat','blue'] ],
    districts: [
      { id:'loop',      name:'The Loop',      x:4, y:3, w:2, h:2, pop:'+2.8%', income:'$121k', rent:'$7.90/sqft', score:52, sat:'high',      note:'Residential conversions on LaSalle Street are adding evening demand to a district built entirely around weekday lunch.' },
      { id:'westloop',  name:'West Loop',     x:3, y:3, w:1, h:2, pop:'+6.1%', income:'$139k', rent:'$9.20/sqft', score:61, sat:'very high', note:'Restaurant Row is fully built out; the remaining opportunity is daytime and family formats, not another dinner concept.' },
      { id:'wickerpark', name:'Wicker Park',  x:3, y:1, w:2, h:2, pop:'+1.6%', income:'$112k', rent:'$6.10/sqft', score:57, sat:'high',      note:'Milwaukee Avenue retail turnover is elevated; strong traffic but weak tenant survival past 24 months.' },
      { id:'logansq',   name:'Logan Square',  x:2, y:0, w:2, h:2, pop:'+3.3%', income:'$98k',  rent:'$4.70/sqft', score:85, sat:'medium',    note:'Blue Line access with rent a third below Wicker Park and the fastest bar-to-cafe conversion rate in the city.' },
      { id:'pilsen',    name:'Pilsen',        x:3, y:5, w:2, h:1, pop:'+1.2%', income:'$64k',  rent:'$3.60/sqft', score:78, sat:'low',       note:'18th Street has cheap ground-floor space, heavy weekend arts traffic and very little breakfast supply.' },
      { id:'lakeview',  name:'Lakeview',      x:5, y:1, w:2, h:2, pop:'+1.9%', income:'$118k', rent:'$6.60/sqft', score:66, sat:'medium',    note:'Wrigleyville trade is intensely seasonal; year-round formats outperform anything dependent on game days.' },
      { id:'hydepark',  name:'Hyde Park',     x:5, y:4, w:2, h:2, pop:'+2.1%', income:'$76k',  rent:'$4.30/sqft', score:81, sat:'low',       note:'University-anchored and recession-resistant, but sit-down dinner options per student remain far below peer campuses.' },
      { id:'bronzeville', name:'Bronzeville', x:0, y:3, w:3, h:2, pop:'+2.6%', income:'$58k',  rent:'$2.80/sqft', score:72, sat:'very low',  note:'Sustained reinvestment and the cheapest retail rent on the South Side, though per-household spend is still building.' }
    ],
    businesses: [
      { id:'loumalnatis', name:"Lou Malnati's Pizzeria", emoji:'\u{1F355}', category:'Pizzeria', hood:'River North', addr:'439 N Wells St',
        rating:4.5, reviews:16800, employees:88, priceTier:'$$', trend:'stable', health:85, closeRisk:7,
        comp:[ ["Giordano's",'tourist placement|larger footprint|national shipping'], ['Pequod\u2019s Pizza','caramelised crust reputation|higher rating|cult following'] ] },
      { id:'portillos', name:"Portillo's", emoji:'\u{1F32D}', category:'Fast casual', hood:'River North', addr:'100 W Ontario St',
        rating:4.5, reviews:21400, employees:130, priceTier:'$', trend:'rising', health:87, closeRisk:6,
        comp:[ ["Al's Beef",'original Italian beef claim|multiple sites'], ['Mr. Beef','media attention|lower prices|single location charm'] ] },
      { id:'bigstar', name:'Big Star', emoji:'\u{1F32E}', category:'Taqueria', hood:'Wicker Park', addr:'1531 N Damen Ave',
        rating:4.4, reviews:6200, employees:56, priceTier:'$$', trend:'declining', health:63, closeRisk:21,
        comp:[ ['Taqueria Chingon','higher rating|Bucktown regulars|handmade tortillas'], ['Antique Taco','brunch trade|family friendly'] ] },
      { id:'girlgoat', name:'Girl & the Goat', emoji:'\u{1F410}', category:'Restaurant', hood:'West Loop', addr:'809 W Randolph St',
        rating:4.6, reviews:9100, employees:120, priceTier:'$$$', trend:'stable', health:82, closeRisk:10,
        comp:[ ['Au Cheval','burger reputation|constant queue|lower ticket'], ['Monteverde','pasta specialism|higher rating|awards'] ] },
      { id:'valois', name:'Valois Restaurant', emoji:'\u{1F373}', category:'Cafeteria', hood:'Hyde Park', addr:'1518 E 53rd St',
        rating:4.5, reviews:3100, employees:31, priceTier:'$', trend:'rising', health:80, closeRisk:11,
        comp:[ ['Medici on 57th','student loyalty|patio|later hours'], ['Nella Pizza e Pasta','sit-down dinner|alcohol licence'] ] },
      { id:'intelligentsiachi', name:'Intelligentsia Coffee', emoji:'\u2615', category:'Coffee shop', hood:'The Loop', addr:'53 E Randolph St',
        rating:4.2, reviews:2400, employees:18, priceTier:'$$', trend:'declining', health:51, closeRisk:34,
        comp:[ ['Sawada Coffee','West Loop draw|matcha niche|weekend trade'], ['Do-Rite Donuts','pairing offer|faster service|lower price'] ] }
    ],
    news: [
      { title:'LaSalle Street reimagined: 1,000 apartments approved in four Loop office towers', src:'Chicago Tribune \u00b7 4h ago', kind:'housing',
        affected:[ ['Loop grocery',38,'up'], ['Evening dining',33,'up'], ['Weekday lunch counters',-11,'down'], ['Gyms',24,'up'] ] },
      { title:'CTA Blue Line slow zones cut Logan Square to Loop reliability by 22%', src:'Block Club Chicago \u00b7 11h ago', kind:'transit',
        affected:[ ['Logan Square bars',-19,'down'], ['Loop lunch trade',-13,'down'], ['Rideshare',37,'up'], ['Local cafes',8,'up'] ] }
    ],
    events: [
      { name:'Cubs vs. Cardinals', when:'Saturday \u00b7 13:20 \u00b7 Wrigley Field', attendance:'41,600',
        effects:[ ['Wrigleyville bars','+180%','up'], ['Parking','$60 surge','down'], ['Lakeview retail','+29%','up'], ['Red Line crowding','Severe','down'], ['Loop restaurants','-9%','down'] ] },
      { name:'Lollapalooza', when:'Thu-Sun \u00b7 11:00 \u00b7 Grant Park', attendance:'400,000',
        effects:[ ['Loop hotels','Sold out','up'], ['South Loop dining','+87%','up'], ['Michigan Ave retail','+41%','up'], ['Traffic','Gridlock','down'], ['Rideshare','+52 min wait','down'] ] }
    ],
    scenarios:[ ['Costco opens in Bronzeville','bigbox'], ['Big Star closes on Damen Avenue','closure'],
                ['Blue Line closes for six weeks of track work','transit'], ['A 1,000-unit LaSalle Street conversion opens','housing'] ],
    insights:[
      'Wrigleyville businesses that derive more than 40% of revenue from game days have a 3.4x higher closure rate in their fourth year.',
      'Logan Square carries 78% of Wicker Park\u2019s foot traffic at 62% of the rent, and its tenant survival rate is 19 points higher.',
      'Every Loop food business that survived the office downturn added either breakfast or weekend hours; none of the closures did.'
    ]
  },

  /* ===== 4. HOUSTON, TX ==================================================== */
  'houston': {
    rank: 4, name: 'Houston', state: 'TX', pop: '2,390,125', pulse: 88,
    stats: [ ['Economy',91,'up','green'], ['Hiring',86,'up','green'], ['Construction',89,'up','blue'],
             ['Consumer sentiment',68,'up','green'], ['Competition',71,'up','orange'], ['Commercial rent',49,'flat','blue'] ],
    districts: [
      { id:'dtownhou',  name:'Downtown',      x:4, y:2, w:2, h:2, pop:'+4.2%', income:'$96k',  rent:'$5.40/sqft', score:64, sat:'medium',   note:'Tunnel-system lunch trade is recovering and residential supply downtown has doubled since 2019.' },
      { id:'montrose',  name:'Montrose',      x:3, y:2, w:1, h:2, pop:'+2.7%', income:'$103k', rent:'$4.80/sqft', score:59, sat:'high',     note:'The most competitive independent restaurant district in Texas; concepts are differentiating on hours, not cuisine.' },
      { id:'heights',   name:'The Heights',   x:3, y:0, w:2, h:2, pop:'+5.1%', income:'$121k', rent:'$4.60/sqft', score:83, sat:'medium',   note:'Fast family formation with strong daytime spend; 19th Street retail still has sub-$5 space.' },
      { id:'eado',      name:'EaDo',          x:6, y:2, w:2, h:2, pop:'+8.4%', income:'$88k',  rent:'$3.20/sqft', score:94, sat:'very low', note:'Fastest-growing district in the city, anchored by the stadium district, with the cheapest new-build retail available.' },
      { id:'ricevillage', name:'Rice Village', x:3, y:4, w:2, h:2, pop:'+1.8%', income:'$134k', rent:'$7.10/sqft', score:55, sat:'high',    note:'Premium student and medical-centre spend, but rent is the highest outside the Galleria and every category is covered.' },
      { id:'thirdward', name:'Third Ward',    x:5, y:4, w:2, h:2, pop:'+2.3%', income:'$47k',  rent:'$2.40/sqft', score:69, sat:'low',      note:'Cheapest retail in the inner loop with university foot traffic, though discretionary spend remains constrained.' },
      { id:'uptownhou', name:'Uptown / Galleria', x:1, y:1, w:2, h:2, pop:'+1.4%', income:'$127k', rent:'$8.90/sqft', score:47, sat:'very high', note:'Mall-anchored and saturated; only destination or luxury formats clear the rent here.' },
      { id:'chinatownhou', name:'Chinatown (Bellaire)', x:0, y:3, w:2, h:2, pop:'+3.6%', income:'$72k', rent:'$2.90/sqft', score:87, sat:'low', note:'Bellaire Boulevard has exceptional regional draw against very low rent - the strongest value corridor in Houston.' }
    ],
    businesses: [
      { id:'ninfas', name:"The Original Ninfa's on Navigation", emoji:'\u{1F32E}', category:'Tex-Mex restaurant', hood:'East End', addr:'2704 Navigation Blvd',
        rating:4.5, reviews:7400, employees:92, priceTier:'$$', trend:'rising', health:86, closeRisk:8,
        comp:[ ['Xochi','downtown location|awards coverage|hotel traffic'], ['El Tiempo Cantina','multiple locations|larger patios|late hours'] ] },
      { id:'pinkertons', name:"Pinkerton's Barbecue", emoji:'\u{1F356}', category:'Barbecue', hood:'The Heights', addr:'1504 Airline Dr',
        rating:4.6, reviews:5100, employees:48, priceTier:'$$', trend:'rising', health:89, closeRisk:6,
        comp:[ ['Truth BBQ','higher rating|weekend queues|dessert programme'], ['Killen\u2019s Barbecue','suburban parking|larger dining room'] ] },
      { id:'commonbond', name:'Common Bond Bistro & Bakery', emoji:'\u{1F950}', category:'Bakery', hood:'Montrose', addr:'1706 Westheimer Rd',
        rating:4.4, reviews:6800, employees:74, priceTier:'$$', trend:'stable', health:76, closeRisk:14,
        comp:[ ['Koffeteria','pastry innovation|EaDo rent|social reach'], ['Magnolia Bakery','brand recognition|Galleria placement'] ] },
      { id:'uchihou', name:'Uchi', emoji:'\u{1F363}', category:'Sushi restaurant', hood:'Montrose', addr:'904 Westheimer Rd',
        rating:4.6, reviews:3900, employees:85, priceTier:'$$$$', trend:'stable', health:83, closeRisk:9,
        comp:[ ['MF Sushi','omakase focus|higher ticket|smaller room'], ['Kata Robata','longer hours|happy hour trade'] ] },
      { id:'phoenicia', name:'Phoenicia Specialty Foods', emoji:'\u{1F6D2}', category:'Specialty grocer', hood:'Downtown', addr:'1001 Austin St',
        rating:4.6, reviews:4600, employees:140, priceTier:'$$', trend:'rising', health:88, closeRisk:7,
        comp:[ ['Central Market','larger range|suburban parking'], ['H-E-B','price leadership|scale|delivery network'] ] },
      { id:'brasilcafe', name:'Brasil Cafe', emoji:'\u2615', category:'Coffee shop', hood:'Montrose', addr:'2604 Dunlavy St',
        rating:4.2, reviews:1800, employees:19, priceTier:'$', trend:'declining', health:57, closeRisk:27,
        comp:[ ['Agora','later hours|wine licence|patio'], ['Blacksmith','specialty reputation|higher rating|breakfast trade'] ] }
    ],
    news: [
      { title:'I-45 North Houston Highway Improvement Project begins downtown segment', src:'Houston Chronicle \u00b7 6h ago', kind:'transit',
        affected:[ ['Gas stations',-29,'down'], ['Downtown lunch',-21,'down'], ['Hotels',16,'up'], ['EaDo dining',13,'up'] ] },
      { title:'Texas Medical Center breaks ground on TMC3 phase two, 4,000 jobs projected', src:'Houston Business Journal \u00b7 1d ago', kind:'housing',
        affected:[ ['Rice Village dining',34,'up'], ['Third Ward housing',41,'up'], ['Coffee shops',26,'up'], ['Childcare',48,'up'] ] }
    ],
    events: [
      { name:'Houston Livestock Show and Rodeo', when:'Through Sunday \u00b7 NRG Park', attendance:'75,000/day',
        effects:[ ['Hotels','+64%','up'], ['Barbecue restaurants','+91%','up'], ['Parking','Full by 16:00','down'], ['Downtown bars','+37%','up'], ['Traffic on 610','Severe','down'] ] },
      { name:'Astros vs. Rangers', when:'Tonight \u00b7 19:10 \u00b7 Daikin Park', attendance:'38,200',
        effects:[ ['EaDo bars','+78%','up'], ['Downtown dining','+42%','up'], ['Parking','$35 surge','down'], ['Rideshare','+22 min','down'], ['Retail','+11%','up'] ] }
    ],
    scenarios:[ ['Costco opens in EaDo','bigbox'], ['Common Bond closes its Westheimer flagship','closure'],
                ['I-45 downtown segment closes two ramps','transit'], ['A 500-unit tower opens in the Heights','housing'] ],
    insights:[
      'EaDo added retail square footage 4.1x faster than Montrose this year while its rent stayed 33% lower.',
      'Every barbecue business in the top quartile by rating runs out of brisket before 14:00 - evening demand is entirely unserved.',
      'Bellaire Boulevard draws customers from an average of 14 miles away, the widest catchment of any corridor tracked in Houston.'
    ]
  },

  /* ===== 5. PHOENIX, AZ ==================================================== */
  'phoenix': {
    rank: 5, name: 'Phoenix', state: 'AZ', pop: '1,673,164', pulse: 85,
    stats: [ ['Economy',87,'up','green'], ['Hiring',83,'up','green'], ['Construction',94,'up','blue'],
             ['Consumer sentiment',66,'up','green'], ['Competition',62,'up','orange'], ['Commercial rent',54,'up','orange'] ],
    districts: [
      { id:'dtownphx',  name:'Downtown Phoenix', x:4, y:2, w:2, h:2, pop:'+6.3%', income:'$71k',  rent:'$3.90/sqft', score:81, sat:'medium',   note:'ASU downtown campus and biomedical expansion are adding daytime population faster than food supply can follow.' },
      { id:'roosevelt', name:'Roosevelt Row',    x:4, y:1, w:2, h:1, pop:'+7.8%', income:'$68k',  rent:'$4.30/sqft', score:88, sat:'medium',   note:'Highest residential construction rate in the metro; the arts district is converting to a full 7-day neighbourhood.' },
      { id:'arcadia',   name:'Arcadia',          x:6, y:2, w:2, h:2, pop:'+2.1%', income:'$148k', rent:'$6.80/sqft', score:57, sat:'high',     note:'The highest household income in the city, but every premium casual slot along Indian School Road is taken.' },
      { id:'midtownphx', name:'Midtown',         x:4, y:0, w:2, h:1, pop:'+3.4%', income:'$79k',  rent:'$3.60/sqft', score:76, sat:'low',      note:'Central Avenue light rail corridor with steady office occupancy and thin evening dining supply.' },
      { id:'desertridge', name:'Desert Ridge',   x:6, y:0, w:3, h:2, pop:'+5.9%', income:'$112k', rent:'$5.20/sqft', score:79, sat:'medium',   note:'North Phoenix growth corridor; family formats and quick service are expanding with rooftops.' },
      { id:'maryvale',  name:'Maryvale',         x:0, y:1, w:3, h:2, pop:'+2.8%', income:'$52k',  rent:'$2.30/sqft', score:71, sat:'very low', note:'The cheapest retail space in the city with a large underserved population, though average ticket size is low.' },
      { id:'ahwatukee', name:'Ahwatukee',        x:2, y:4, w:3, h:2, pop:'+1.7%', income:'$104k', rent:'$4.10/sqft', score:68, sat:'medium',   note:'Stable suburban spend, geographically isolated by South Mountain, which protects incumbents from new entrants.' },
      { id:'laveen',    name:'Laveen',           x:0, y:3, w:2, h:3, pop:'+9.2%', income:'$86k',  rent:'$2.70/sqft', score:92, sat:'very low', note:'Fastest population growth in Phoenix against almost no sit-down restaurant supply - the clearest opportunity on the map.' }
    ],
    businesses: [
      { id:'pizzeriabianco', name:'Pizzeria Bianco', emoji:'\u{1F355}', category:'Pizzeria', hood:'Heritage Square', addr:'623 E Adams St',
        rating:4.6, reviews:6900, employees:52, priceTier:'$$', trend:'rising', health:92, closeRisk:5,
        comp:[ ['Cibo','patio setting|later hours|wine list'], ['Pomo Pizzeria','multiple locations|delivery|lunch specials'] ] },
      { id:'mattsbig', name:"Matt's Big Breakfast", emoji:'\u{1F373}', category:'Breakfast restaurant', hood:'Downtown Phoenix', addr:'825 N 1st St',
        rating:4.5, reviews:5400, employees:36, priceTier:'$$', trend:'stable', health:84, closeRisk:9,
        comp:[ ['The Breakfast Club','Scottsdale traffic|larger room|cocktails'], ['Snooze','chain scale|reservations|patio'] ] },
      { id:'barriocafe', name:'Barrio Caf\u00e9', emoji:'\u{1F32E}', category:'Mexican restaurant', hood:'Coronado', addr:'2814 N 16th St',
        rating:4.5, reviews:4200, employees:44, priceTier:'$$', trend:'stable', health:78, closeRisk:13,
        comp:[ ['Bacanora','higher rating|wood-fire niche|weekend queues'], ['Gallo Blanco','downtown hotel traffic|breakfast trade'] ] },
      { id:'luxcentral', name:'Lux Central', emoji:'\u2615', category:'Coffee shop', hood:'Midtown', addr:'4402 N Central Ave',
        rating:4.4, reviews:3300, employees:28, priceTier:'$$', trend:'rising', health:81, closeRisk:11,
        comp:[ ['Cartel Coffee Lab','roastery|multiple sites|student crowd'], ['Futuro','newer build|design draw|smaller menu'] ] },
      { id:'thechurchill', name:'The Churchill', emoji:'\u{1F3EA}', category:'Food hall', hood:'Roosevelt Row', addr:'901 N 1st St',
        rating:4.5, reviews:2900, employees:66, priceTier:'$$', trend:'rising', health:87, closeRisk:8,
        comp:[ ['Downtown Phoenix Public Market','farmers market draw|weekend only'], ['Uptown Plaza','established tenants|parking'] ] },
      { id:'ranchmarket', name:'Los Altos Ranch Market', emoji:'\u{1F6D2}', category:'Grocery', hood:'Maryvale', addr:'4747 N 51st Ave',
        rating:4.3, reviews:2100, employees:95, priceTier:'$', trend:'declining', health:59, closeRisk:26,
        comp:[ ['Food City','price leadership|more locations|fuel points'], ['Walmart Supercenter','scale|delivery|one-stop range'] ] }
    ],
    news: [
      { title:'TSMC announces third Phoenix fab, total investment rises to $65 billion', src:'Arizona Republic \u00b7 2h ago', kind:'housing',
        affected:[ ['North Phoenix housing',52,'up'], ['Restaurants',37,'up'], ['Childcare',44,'up'], ['Commercial rent',29,'up'] ] },
      { title:'Valley Metro light rail South Central extension opens to Baseline Road', src:'AZCentral \u00b7 9h ago', kind:'transit',
        affected:[ ['South Phoenix retail',31,'up'], ['Laveen dining',24,'up'], ['Parking operators',-18,'down'], ['Bus ridership',-12,'down'] ] }
    ],
    events: [
      { name:'Suns vs. Nuggets', when:'Tonight \u00b7 19:00 \u00b7 Footprint Center', attendance:'17,000',
        effects:[ ['Downtown bars','+68%','up'], ['Roosevelt Row dining','+43%','up'], ['Parking','Full by 18:20','down'], ['Light rail','+31%','up'], ['Retail','+9%','up'] ] },
      { name:'Waste Management Phoenix Open', when:'Thu-Sun \u00b7 TPC Scottsdale', attendance:'190,000',
        effects:[ ['Hotels','+88%','up'], ['Scottsdale restaurants','+124%','up'], ['Rideshare','+46 min wait','down'], ['Downtown trade','-14%','down'], ['Golf retail','+71%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Laveen','bigbox'], ['Pizzeria Bianco closes its Heritage Square location','closure'],
                ['Light rail construction closes Central Avenue lanes','transit'], ['A 700-unit tower opens on Roosevelt Row','housing'] ],
    insights:[
      'Laveen has grown its population 9.2% while adding just two sit-down restaurants - the largest supply gap of any district tracked nationally.',
      'Patio-dependent businesses in Phoenix lose 34% of covers between June and September; those with misting systems lose only 11%.',
      'Every semiconductor announcement in the metro has been followed by childcare demand rising within two quarters, ahead of restaurants.'
    ]
  },

  /* ===== 6. PHILADELPHIA, PA =============================================== */
  'philadelphia': {
    rank: 6, name: 'Philadelphia', state: 'PA', pop: '1,573,916', pulse: 74,
    stats: [ ['Economy',71,'up','green'], ['Hiring',68,'up','green'], ['Construction',59,'flat','blue'],
             ['Consumer sentiment',54,'down','red'], ['Competition',77,'up','orange'], ['Commercial rent',52,'flat','blue'] ],
    districts: [
      { id:'centercity', name:'Center City',    x:4, y:2, w:2, h:2, pop:'+3.1%', income:'$104k', rent:'$6.70/sqft', score:56, sat:'high',      note:'Walnut and Chestnut Street retail is stable but fully leased; growth now depends on residential conversions.' },
      { id:'fishtown',   name:'Fishtown',       x:6, y:1, w:2, h:2, pop:'+5.4%', income:'$92k',  rent:'$4.20/sqft', score:86, sat:'medium',    note:'Frankford Avenue is the fastest-improving corridor in the city, with rent still well below Center City.' },
      { id:'universitycity', name:'University City', x:2, y:3, w:2, h:2, pop:'+4.7%', income:'$81k', rent:'$5.90/sqft', score:82, sat:'medium', note:'Penn and Drexel expansion plus the cell-and-gene therapy cluster keep daytime population climbing.' },
      { id:'southphilly', name:'South Philadelphia', x:4, y:4, w:2, h:2, pop:'+1.9%', income:'$67k', rent:'$3.10/sqft', score:79, sat:'low',    note:'East Passyunk has proven the model; the surrounding blocks still offer sub-$3.50 space with the same catchment.' },
      { id:'northernliberties', name:'Northern Liberties', x:5, y:1, w:1, h:2, pop:'+3.8%', income:'$98k', rent:'$4.80/sqft', score:73, sat:'medium', note:'Young renter density with strong evening trade; breakfast and daytime formats are the thin categories.' },
      { id:'germantown', name:'Germantown',     x:3, y:0, w:2, h:1, pop:'+2.2%', income:'$58k',  rent:'$2.60/sqft', score:75, sat:'very low',   note:'Historic main street with the cheapest viable retail in the city and rising owner-occupier households.' },
      { id:'kensington', name:'Kensington',     x:6, y:0, w:2, h:1, pop:'+1.1%', income:'$44k',  rent:'$2.20/sqft', score:38, sat:'low',        note:'Rent is the lowest in Philadelphia but persistent public safety issues suppress evening and discretionary trade.' },
      { id:'manayunk',   name:'Manayunk',       x:0, y:1, w:3, h:2, pop:'+1.6%', income:'$89k',  rent:'$3.80/sqft', score:66, sat:'medium',     note:'Main Street draws a regional weekend crowd, but weekday trade is thin and parking is the top complaint.' }
    ],
    businesses: [
      { id:'readingterminal', name:'Reading Terminal Market', emoji:'\u{1F3EA}', category:'Public market', hood:'Center City', addr:'51 N 12th St',
        rating:4.7, reviews:41200, employees:280, priceTier:'$$', trend:'rising', health:91, closeRisk:4,
        comp:[ ['Italian Market','outdoor format|lower stall fees|South Philly regulars'], ['Bourse Food Hall','newer build|seating|tourist overlap'] ] },
      { id:'johnsroast', name:"John's Roast Pork", emoji:'\u{1F96A}', category:'Sandwich shop', hood:'South Philadelphia', addr:'14 Snyder Ave',
        rating:4.7, reviews:3400, employees:18, priceTier:'$', trend:'stable', health:83, closeRisk:10,
        comp:[ ["Dalessandro's",'longer hours|Roxborough catchment'], ["Pat's King of Steaks",'24-hour service|tourist placement|brand recognition'] ] },
      { id:'zahav', name:'Zahav', emoji:'\u{1F958}', category:'Israeli restaurant', hood:'Society Hill', addr:'237 St James Pl',
        rating:4.7, reviews:4900, employees:88, priceTier:'$$$$', trend:'stable', health:88, closeRisk:6,
        comp:[ ['Suraya','Fishtown patio|all-day format|market attached'], ['Laser Wolf','sibling concept|faster turns|lower ticket'] ] },
      { id:'lascazuelas', name:'Las Cazuelas', emoji:'\u{1F32E}', category:'Mexican restaurant', hood:'Northern Liberties', addr:'426 W Girard Ave',
        rating:4.4, reviews:1600, employees:26, priceTier:'$$', trend:'declining', health:58, closeRisk:29,
        comp:[ ['South Philly Barbacoa','award coverage|weekend queues|cult following'], ['Cantina Los Caballitos','later hours|bar programme|cheaper'] ] },
      { id:'labancabakery', name:'La Colombe Coffee Roasters', emoji:'\u2615', category:'Coffee shop', hood:'Fishtown', addr:'1335 Frankford Ave',
        rating:4.4, reviews:2800, employees:34, priceTier:'$$', trend:'rising', health:85, closeRisk:8,
        comp:[ ['ReAnimator Coffee','roastery|neighbourhood loyalty|wholesale'], ['Elixr Coffee','Center City offices|faster service'] ] },
      { id:'mikescheesesteaks', name:"Mike's BBQ", emoji:'\u{1F356}', category:'Barbecue', hood:'South Philadelphia', addr:'1703 S 11th St',
        rating:4.5, reviews:1200, employees:15, priceTier:'$$', trend:'declining', health:62, closeRisk:23,
        comp:[ ['Fette Sau','Fishtown draw|beer programme|larger room'], ['Smokin Betty\u2019s','Center City traffic|full menu'] ] }
    ],
    news: [
      { title:'Penn and CHOP break ground on 1.5 million sq ft University City research campus', src:'Philadelphia Inquirer \u00b7 5h ago', kind:'housing',
        affected:[ ['University City dining',39,'up'], ['Housing demand',44,'up'], ['Coffee shops',28,'up'], ['Parking',-16,'down'] ] },
      { title:'SEPTA Market-Frankford Line weekend shutdown for Frankford Avenue signal work', src:'Billy Penn \u00b7 10h ago', kind:'transit',
        affected:[ ['Fishtown bars',-24,'down'], ['Center City retail',-11,'down'], ['Rideshare',33,'up'], ['Local cafes',7,'up'] ] }
    ],
    events: [
      { name:'Eagles vs. Cowboys', when:'Sunday \u00b7 16:25 \u00b7 Lincoln Financial Field', attendance:'69,800',
        effects:[ ['South Philly bars','+152%','up'], ['Parking','$70 surge','down'], ['Broad Street Line','+94%','up'], ['Center City dining','-12%','down'], ['Hotels','+41%','up'] ] },
      { name:'Mummers Parade', when:'January 1 \u00b7 09:00 \u00b7 Broad Street', attendance:'100,000',
        effects:[ ['Broad Street bars','+210%','up'], ['Street closures','42 blocks','down'], ['Cafes','+66%','up'], ['Retail','-9%','down'], ['Rideshare','+38 min','down'] ] }
    ],
    scenarios:[ ['Costco opens in Kensington','bigbox'], ['Zahav closes in Society Hill','closure'],
                ['Market-Frankford Line closes for six weekends','transit'], ['A 450-unit building opens in Fishtown','housing'] ],
    insights:[
      'Fishtown rents have risen 31% in three years while Kensington, six blocks north, has stayed flat - the sharpest rent cliff in the city.',
      'Every cheesesteak shop in the top quartile by rating is cash-only and closes by 20:00, leaving late-night demand to chains.',
      'Businesses within 200m of a SEPTA station recovered from the last shutdown 2.7x faster than those relying on street parking.'
    ]
  },

  /* ===== 7. SAN ANTONIO, TX ================================================ */
  'san-antonio': {
    rank: 7, name: 'San Antonio', state: 'TX', pop: '1,526,656', pulse: 82,
    stats: [ ['Economy',84,'up','green'], ['Hiring',79,'up','green'], ['Construction',86,'up','blue'],
             ['Consumer sentiment',71,'up','green'], ['Competition',58,'flat','orange'], ['Commercial rent',44,'up','orange'] ],
    districts: [
      { id:'downtownsat', name:'Downtown',      x:4, y:2, w:2, h:2, pop:'+3.9%', income:'$68k',  rent:'$4.60/sqft', score:67, sat:'high',      note:'River Walk trade is tourist-dependent; resident-facing formats one block off the water perform better per dollar of rent.' },
      { id:'pearl',      name:'The Pearl',      x:4, y:1, w:2, h:1, pop:'+6.7%', income:'$103k', rent:'$7.40/sqft', score:63, sat:'very high', note:'The most successful redevelopment in Texas, and now fully leased at rents triple the city median.' },
      { id:'southtown',  name:'Southtown',      x:4, y:4, w:2, h:2, pop:'+4.3%', income:'$74k',  rent:'$3.40/sqft', score:88, sat:'medium',    note:'South Flores and the Blue Star complex are drawing Pearl-style demand at less than half the rent.' },
      { id:'alamoheights', name:'Alamo Heights', x:6, y:1, w:2, h:2, pop:'+1.2%', income:'$142k', rent:'$6.10/sqft', score:59, sat:'high',     note:'Highest household income in the metro but almost no vacant space and strict signage rules.' },
      { id:'stonesoak',  name:'Stone Oak',      x:6, y:0, w:3, h:1, pop:'+5.8%', income:'$118k', rent:'$5.30/sqft', score:80, sat:'medium',    note:'Far north suburban growth with strong family spend; casual dining is expanding with new rooftops.' },
      { id:'westside',   name:'West Side',      x:1, y:2, w:3, h:2, pop:'+2.4%', income:'$46k',  rent:'$2.10/sqft', score:72, sat:'very low',  note:'Cheapest retail space of any district tracked in Texas, with a large, loyal and underserved population.' },
      { id:'medicalctr', name:'Medical Center', x:1, y:0, w:3, h:2, pop:'+4.1%', income:'$89k',  rent:'$4.40/sqft', score:84, sat:'low',       note:'Around 30,000 shift workers with almost no late-night or early-morning food supply - a structural gap.' },
      { id:'brooksville', name:'Brooks City Base', x:4, y:5, w:4, h:1, pop:'+7.2%', income:'$71k', rent:'$2.80/sqft', score:90, sat:'very low', note:'Master-planned redevelopment adding housing faster than any district in the city, with retail supply far behind.' }
    ],
    businesses: [
      { id:'mitierra', name:'Mi Tierra Caf\u00e9 y Panader\u00eda', emoji:'\u{1F32E}', category:'Mexican restaurant', hood:'Market Square', addr:'218 Produce Row',
        rating:4.4, reviews:18600, employees:165, priceTier:'$$', trend:'stable', health:80, closeRisk:11,
        comp:[ ['La Panader\u00eda','higher rating|artisan bread|two locations'], ['Rosario\u2019s','Southtown crowd|bar programme|later hours'] ] },
      { id:'cured', name:'Cured at Pearl', emoji:'\u{1F969}', category:'Restaurant', hood:'The Pearl', addr:'306 Pearl Pkwy',
        rating:4.6, reviews:3900, employees:62, priceTier:'$$$', trend:'rising', health:87, closeRisk:7,
        comp:[ ['Supper at Hotel Emma','hotel traffic|higher ticket|riverside patio'], ['Botika','Pearl neighbour|fusion niche'] ] },
      { id:'2mbbq', name:'2M Smokehouse', emoji:'\u{1F356}', category:'Barbecue', hood:'South Side', addr:'2731 S WW White Rd',
        rating:4.6, reviews:2400, employees:22, priceTier:'$$', trend:'rising', health:89, closeRisk:6,
        comp:[ ['Burnt Bean Co','higher rating|Seguin destination trade'], ['The Granary','Pearl location|beer programme'] ] },
      { id:'bakerystella', name:'Bakery Lorraine', emoji:'\u{1F950}', category:'Bakery', hood:'The Pearl', addr:'306 Pearl Pkwy',
        rating:4.4, reviews:4100, employees:58, priceTier:'$$', trend:'stable', health:75, closeRisk:15,
        comp:[ ['Bread & Butter','lower rent|neighbourhood regulars'], ['Nadler\u2019s Bakery','established wholesale|cheaper'] ] },
      { id:'commonwealthcoffee', name:'Commonwealth Coffeehouse', emoji:'\u2615', category:'Coffee shop', hood:'Alamo Heights', addr:'8000 Broadway St',
        rating:4.5, reviews:1900, employees:24, priceTier:'$$', trend:'stable', health:77, closeRisk:14,
        comp:[ ['Local Coffee','multiple sites|faster service|drive-through'], ['Estate Coffee','downtown offices|specialty reputation'] ] },
      { id:'schilos', name:"Schilo's Delicatessen", emoji:'\u{1F96A}', category:'Delicatessen', hood:'Downtown', addr:'424 E Commerce St',
        rating:4.3, reviews:3200, employees:29, priceTier:'$', trend:'declining', health:55, closeRisk:32,
        comp:[ ['Ocho at Havana','riverside seating|hotel guests|bar'], ['Cured','Pearl catchment|higher rating|newer build'] ] }
    ],
    news: [
      { title:'Project Marvel arena and downtown sports district clears city council vote', src:'San Antonio Express-News \u00b7 4h ago', kind:'housing',
        affected:[ ['Downtown bars',47,'up'], ['Hotels',36,'up'], ['Southtown dining',22,'up'], ['Parking',-24,'down'] ] },
      { title:'Toyota Texas announces third shift at San Antonio plant, 1,200 jobs', src:'KSAT \u00b7 1d ago', kind:'housing',
        affected:[ ['South Side retail',33,'up'], ['Quick service',41,'up'], ['Childcare',37,'up'], ['Housing demand',29,'up'] ] }
    ],
    events: [
      { name:'Spurs vs. Mavericks', when:'Tonight \u00b7 19:00 \u00b7 Frost Bank Center', attendance:'18,400',
        effects:[ ['East Side bars','+59%','up'], ['Downtown dining','+27%','up'], ['Parking','Full by 18:10','down'], ['Rideshare','+19 min','down'], ['Retail','+8%','up'] ] },
      { name:'Fiesta San Antonio', when:'Ten days \u00b7 Citywide', attendance:'2.5M',
        effects:[ ['River Walk restaurants','+186%','up'], ['Hotels','Sold out','up'], ['Street closures','60+ blocks','down'], ['Retail','+72%','up'], ['Traffic','Gridlock','down'] ] }
    ],
    scenarios:[ ['Costco opens at Brooks City Base','bigbox'], ["Schilo's Delicatessen closes downtown",'closure'],
                ['I-35 downtown lanes close for expansion','transit'], ['A 400-unit building opens in Southtown','housing'] ],
    insights:[
      'Southtown carries 71% of the Pearl\u2019s weekend foot traffic at 46% of the rent - the widest value gap in the city.',
      'The Medical Center employs about 30,000 shift workers, yet only four food businesses within a mile open before 06:00.',
      'River Walk businesses lose 38% of covers in the two weeks after Fiesta ends; those with local loyalty programmes lose 12%.'
    ]
  },

  /* ===== 8. SAN DIEGO, CA ================================================== */
  'san-diego': {
    rank: 8, name: 'San Diego', state: 'CA', pop: '1,404,452', pulse: 79,
    stats: [ ['Economy',78,'up','green'], ['Hiring',72,'up','green'], ['Construction',64,'flat','blue'],
             ['Consumer sentiment',63,'down','red'], ['Competition',81,'up','orange'], ['Commercial rent',87,'up','orange'] ],
    districts: [
      { id:'gaslamp',    name:'Gaslamp Quarter', x:4, y:4, w:2, h:2, pop:'+2.2%', income:'$92k',  rent:'$8.10/sqft', score:44, sat:'very high', note:'Convention and tourist dependent, with the highest rent and highest tenant turnover in the county.' },
      { id:'northpark',  name:'North Park',      x:5, y:2, w:2, h:2, pop:'+3.4%', income:'$97k',  rent:'$5.20/sqft', score:76, sat:'high',      note:'30th Street is the strongest independent corridor in the city, though the craft beer category is now oversupplied.' },
      { id:'littleitaly', name:'Little Italy',   x:3, y:3, w:1, h:2, pop:'+5.1%', income:'$126k', rent:'$7.30/sqft', score:61, sat:'very high', note:'Highest residential growth downtown, but every restaurant slot on India Street is leased at premium rates.' },
      { id:'lajolla',    name:'La Jolla',        x:1, y:1, w:2, h:2, pop:'+0.7%', income:'$168k', rent:'$9.80/sqft', score:41, sat:'high',      note:'The wealthiest catchment in the city paired with the highest rent and near-zero population growth.' },
      { id:'barrio',     name:'Barrio Logan',    x:5, y:5, w:3, h:1, pop:'+4.6%', income:'$54k',  rent:'$2.90/sqft', score:89, sat:'low',       note:'Logan Avenue has an established arts draw with the cheapest retail in the urban core - the best entry point in San Diego.' },
      { id:'hillcrest',  name:'Hillcrest',       x:4, y:2, w:1, h:2, pop:'+2.8%', income:'$88k',  rent:'$5.80/sqft', score:69, sat:'medium',    note:'Dense, walkable and reliably busy at night; daytime and family formats are the underserved half.' },
      { id:'miramesa',   name:'Mira Mesa',       x:6, y:0, w:3, h:2, pop:'+3.9%', income:'$114k', rent:'$4.10/sqft', score:83, sat:'low',       note:'Biotech and defence employment growth on Miramar Road with rent half of the coastal districts.' },
      { id:'chulaadj',   name:'Otay Mesa',       x:1, y:4, w:3, h:2, pop:'+6.4%', income:'$79k',  rent:'$2.60/sqft', score:85, sat:'very low',  note:'Cross-border logistics growth is adding employment fast while retail supply lags well behind.' }
    ],
    businesses: [
      { id:'hodads', name:"Hodad's", emoji:'\u{1F354}', category:'Burger restaurant', hood:'Ocean Beach', addr:'5010 Newport Ave',
        rating:4.5, reviews:9800, employees:54, priceTier:'$', trend:'stable', health:81, closeRisk:10,
        comp:[ ['Rocky\u2019s Crown Pub','cash only|cult following|lower rent'], ['In-N-Out','drive-through|price|scale'] ] },
      { id:'lapuerta', name:'Las Cuatro Milpas', emoji:'\u{1F32E}', category:'Mexican restaurant', hood:'Barrio Logan', addr:'1857 Logan Ave',
        rating:4.7, reviews:4600, employees:24, priceTier:'$', trend:'rising', health:90, closeRisk:5,
        comp:[ ['Salud!','later hours|bar programme|art crowd'], ['Las Cuatro copycats','longer hours|delivery apps'] ] },
      { id:'addison', name:'Addison', emoji:'\u{1F37D}', category:'Fine dining', hood:'Carmel Valley', addr:'5200 Grand Del Mar Way',
        rating:4.8, reviews:1100, employees:78, priceTier:'$$$$', trend:'rising', health:93, closeRisk:4,
        comp:[ ['Animae','downtown location|larger room|bar trade'], ['Soichi Sushi','omakase niche|higher turns'] ] },
      { id:'communalcoffee', name:'Communal Coffee', emoji:'\u2615', category:'Coffee shop', hood:'North Park', addr:'2335 University Ave',
        rating:4.4, reviews:2200, employees:21, priceTier:'$$', trend:'stable', health:74, closeRisk:16,
        comp:[ ['Dark Horse Coffee','multiple sites|later hours'], ['Holsem Coffee','food menu|larger seating'] ] },
      { id:'stonebrewing', name:'Stone Brewing World Bistro', emoji:'\u{1F37A}', category:'Brewpub', hood:'Liberty Station', addr:'2816 Historic Decatur Rd',
        rating:4.5, reviews:7300, employees:110, priceTier:'$$', trend:'declining', health:66, closeRisk:20,
        comp:[ ['Ballast Point','harbour location|tour programme'], ['Modern Times','North Park draw|younger crowd|lower prices'] ] },
      { id:'lajollabakery', name:'Girard Gourmet', emoji:'\u{1F950}', category:'Bakery', hood:'La Jolla', addr:'7837 Girard Ave',
        rating:4.4, reviews:1400, employees:26, priceTier:'$$', trend:'declining', health:57, closeRisk:30,
        comp:[ ['Wayfarer Bread','higher rating|specialist sourdough|wholesale'], ['Bobboi Gelato','tourist footfall|lower ticket'] ] }
    ],
    news: [
      { title:'San Diego biotech leases 800,000 sq ft in Torrey Pines despite funding slowdown', src:'San Diego Union-Tribune \u00b7 7h ago', kind:'housing',
        affected:[ ['Mira Mesa dining',26,'up'], ['Coffee shops',19,'up'], ['Housing demand',31,'up'], ['Childcare',22,'up'] ] },
      { title:'Blue Line trolley single-tracking through Barrio Logan for four months', src:'KPBS \u00b7 12h ago', kind:'transit',
        affected:[ ['Barrio Logan retail',-21,'down'], ['Gaslamp trade',-9,'down'], ['Parking demand',28,'up'], ['Rideshare',24,'up'] ] }
    ],
    events: [
      { name:'Comic-Con International', when:'Thu-Sun \u00b7 San Diego Convention Center', attendance:'135,000',
        effects:[ ['Gaslamp restaurants','+240%','up'], ['Hotels','Sold out','up'], ['Rideshare','+61 min wait','down'], ['Parking','$80 surge','down'], ['Retail','+118%','up'] ] },
      { name:'Padres vs. Dodgers', when:'Tonight \u00b7 18:40 \u00b7 Petco Park', attendance:'44,900',
        effects:[ ['East Village bars','+96%','up'], ['Gaslamp dining','+54%','up'], ['Trolley crowding','Severe','down'], ['Parking','Full by 17:30','down'], ['Hotels','+29%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Otay Mesa','bigbox'], ['Stone Brewing closes its Liberty Station bistro','closure'],
                ['Blue Line trolley single-tracks for four months','transit'], ['A 500-unit tower opens in Little Italy','housing'] ],
    insights:[
      'Barrio Logan has 62% of North Park\u2019s weekend foot traffic at 56% of the rent, and it is the only urban district still adding independents.',
      'Craft breweries opened within 400m of another brewery since 2022 have a 2.9x higher closure rate than those that were not.',
      'Gaslamp businesses derive 41% of annual revenue from twelve convention weeks - the most concentrated seasonality tracked nationally.'
    ]
  },

  /* ===== 9. DALLAS, TX ===================================================== */
  'dallas': {
    rank: 9, name: 'Dallas', state: 'TX', pop: '1,326,087', pulse: 86,
    stats: [ ['Economy',89,'up','green'], ['Hiring',88,'up','green'], ['Construction',91,'up','blue'],
             ['Consumer sentiment',69,'up','green'], ['Competition',74,'up','orange'], ['Commercial rent',63,'up','orange'] ],
    districts: [
      { id:'downtowndal', name:'Downtown',      x:4, y:2, w:2, h:2, pop:'+5.2%', income:'$98k',  rent:'$5.80/sqft', score:71, sat:'medium',    note:'Office-to-residential conversions are the fastest in Texas, turning a 9-to-5 core into a residential district.' },
      { id:'deepellum',  name:'Deep Ellum',     x:6, y:2, w:2, h:2, pop:'+4.4%', income:'$81k',  rent:'$4.20/sqft', score:78, sat:'high',      note:'Strongest nightlife density in the metro; daytime and family formats remain almost entirely unbuilt.' },
      { id:'bishoparts', name:'Bishop Arts District', x:3, y:4, w:2, h:2, pop:'+3.7%', income:'$76k', rent:'$4.90/sqft', score:74, sat:'high', note:'Successful and now expensive; the surrounding Oak Cliff blocks offer the same catchment at half the rent.' },
      { id:'uptowndal',  name:'Uptown',         x:4, y:1, w:2, h:1, pop:'+2.9%', income:'$139k', rent:'$7.60/sqft', score:57, sat:'very high', note:'McKinney Avenue is fully leased at premium rents with high tenant churn among restaurants.' },
      { id:'oaklawn',    name:'Oak Lawn',       x:3, y:1, w:1, h:2, pop:'+2.1%', income:'$112k', rent:'$6.10/sqft', score:64, sat:'high',      note:'Dense and reliably busy at night, but Cedar Springs retail rarely turns over.' },
      { id:'trinitygroves', name:'Trinity Groves', x:2, y:2, w:1, h:2, pop:'+6.8%', income:'$87k', rent:'$3.60/sqft', score:88, sat:'low',     note:'West Dallas is adding residents faster than any district while retail rent stays under $4.' },
      { id:'southdallas', name:'South Dallas',  x:5, y:5, w:3, h:1, pop:'+1.8%', income:'$41k',  rent:'$1.90/sqft', score:61, sat:'very low',  note:'The cheapest retail space of any district in this atlas, with a large population and very thin supply.' },
      { id:'prestonhollow', name:'Preston Hollow', x:2, y:0, w:3, h:1, pop:'+1.3%', income:'$186k', rent:'$6.40/sqft', score:53, sat:'medium', note:'Very high household income and stable demand, but almost no available ground-floor space.' }
    ],
    businesses: [
      { id:'pecanlodge', name:'Pecan Lodge', emoji:'\u{1F356}', category:'Barbecue', hood:'Deep Ellum', addr:'2702 Main St',
        rating:4.6, reviews:11400, employees:76, priceTier:'$$', trend:'rising', health:90, closeRisk:5,
        comp:[ ['Terry Black\u2019s','larger capacity|Austin brand|longer hours'], ['Cattleack Barbeque','higher rating|limited days|cult following'] ] },
      { id:'mansiondallas', name:'Mansion Restaurant', emoji:'\u{1F37D}', category:'Fine dining', hood:'Turtle Creek', addr:'2821 Turtle Creek Blvd',
        rating:4.5, reviews:2300, employees:94, priceTier:'$$$$', trend:'stable', health:82, closeRisk:9,
        comp:[ ['Monarch','skyline views|newer build|bar trade'], ['Knife','steak specialism|hotel traffic'] ] },
      { id:'emporiumpies', name:'Emporium Pies', emoji:'\u{1F967}', category:'Bakery', hood:'Bishop Arts District', addr:'314 N Bishop Ave',
        rating:4.7, reviews:3800, employees:29, priceTier:'$$', trend:'rising', health:88, closeRisk:6,
        comp:[ ['Village Baking Co','wholesale contracts|bread range'], ['Bisous Bisous','patisserie niche|Uptown catchment'] ] },
      { id:'velvettaco', name:'Velvet Taco', emoji:'\u{1F32E}', category:'Fast casual', hood:'Uptown', addr:'3012 N Henderson Ave',
        rating:4.4, reviews:6100, employees:48, priceTier:'$', trend:'stable', health:79, closeRisk:12,
        comp:[ ['Torchy\u2019s Tacos','drive-through|scale|breakfast trade'], ['Revolver Taco Lounge','higher rating|Deep Ellum draw'] ] },
      { id:'ascension', name:'Ascension Coffee', emoji:'\u2615', category:'Coffee shop', hood:'Design District', addr:'1621 Oak Lawn Ave',
        rating:4.3, reviews:2700, employees:32, priceTier:'$$', trend:'declining', health:60, closeRisk:25,
        comp:[ ['Houndstooth Coffee','multiple sites|specialty reputation'], ['La La Land Kind Cafe','social mission|younger crowd|cheaper'] ] },
      { id:'dallasfarmers', name:'Dallas Farmers Market', emoji:'\u{1F3EA}', category:'Public market', hood:'Downtown', addr:'920 S Harwood St',
        rating:4.4, reviews:8900, employees:135, priceTier:'$$', trend:'declining', health:64, closeRisk:19,
        comp:[ ['Legacy Hall','Plano affluence|newer build|parking'], ['Trinity Groves','waterfront views|incubator model'] ] }
    ],
    news: [
      { title:'Goldman Sachs opens 800,000 sq ft North Dallas campus, 5,000 staff', src:'Dallas Morning News \u00b7 3h ago', kind:'housing',
        affected:[ ['Uptown dining',34,'up'], ['Housing demand',47,'up'], ['Coffee shops',29,'up'], ['Parking',-19,'down'] ] },
      { title:'I-345 teardown study advances, Deep Ellum access to change for three years', src:'D Magazine \u00b7 1d ago', kind:'transit',
        affected:[ ['Deep Ellum bars',-27,'down'], ['Downtown retail',-14,'down'], ['Property values',22,'up'], ['Rideshare',31,'up'] ] }
    ],
    events: [
      { name:'State Fair of Texas', when:'24 days \u00b7 Fair Park', attendance:'2.3M',
        effects:[ ['Fair Park vendors','+320%','up'], ['South Dallas retail','+44%','up'], ['Parking','$40 surge','down'], ['DART ridership','+87%','up'], ['Deep Ellum dining','+23%','up'] ] },
      { name:'Mavericks vs. Spurs', when:'Tonight \u00b7 19:30 \u00b7 American Airlines Center', attendance:'19,600',
        effects:[ ['Victory Park bars','+74%','up'], ['Uptown dining','+31%','up'], ['Parking','Full by 18:45','down'], ['Rideshare','+24 min','down'], ['Retail','+7%','up'] ] }
    ],
    scenarios:[ ['Costco opens in South Dallas','bigbox'], ['Dallas Farmers Market loses its anchor tenant','closure'],
                ['I-345 closes for demolition','transit'], ['A 800-unit downtown conversion opens','housing'] ],
    insights:[
      'Trinity Groves is adding residents 3.8x faster than Uptown while its retail rent is 53% lower - the widest growth-to-rent gap in Texas.',
      'Every barbecue business in the metro that added shipping survived the last cost cycle; two of the three that did not have closed.',
      'Deep Ellum businesses that opened before 11:00 grew revenue 2.2x faster than nightlife-only formats over the past year.'
    ]
  },

  /* ===== 10. JACKSONVILLE, FL ============================================== */
  'jacksonville': {
    rank: 10, name: 'Jacksonville', state: 'FL', pop: '1,009,833', pulse: 81,
    stats: [ ['Economy',82,'up','green'], ['Hiring',77,'up','green'], ['Construction',84,'up','blue'],
             ['Consumer sentiment',70,'up','green'], ['Competition',51,'flat','orange'], ['Commercial rent',47,'up','orange'] ],
    districts: [
      { id:'downtownjax', name:'Downtown',      x:4, y:2, w:2, h:2, pop:'+4.8%', income:'$72k',  rent:'$3.80/sqft', score:74, sat:'low',       note:'Riverfront redevelopment and residential conversions are finally adding evening population to a hollow core.' },
      { id:'riverside',  name:'Riverside / Avondale', x:3, y:2, w:1, h:2, pop:'+3.2%', income:'$88k', rent:'$4.10/sqft', score:82, sat:'medium', note:'Historic King Street corridor with the strongest independent scene in the city and rent still under $4.50.' },
      { id:'sanmarco',   name:'San Marco',      x:4, y:4, w:2, h:2, pop:'+2.6%', income:'$104k', rent:'$4.60/sqft', score:77, sat:'medium',    note:'Affluent and walkable around San Marco Square, though the square itself is fully leased.' },
      { id:'beaches',    name:'Jacksonville Beach', x:7, y:2, w:2, h:2, pop:'+3.9%', income:'$97k', rent:'$5.90/sqft', score:69, sat:'high',   note:'Strong seasonal trade with the highest rent in the county; year-round formats outperform tourist-only concepts.' },
      { id:'southside',  name:'Southside',      x:5, y:4, w:2, h:2, pop:'+6.1%', income:'$83k',  rent:'$3.40/sqft', score:86, sat:'low',       note:'The metro\u2019s employment growth centre around Deerwood, with retail supply well behind rooftop growth.' },
      { id:'springfield', name:'Springfield',   x:4, y:1, w:2, h:1, pop:'+5.4%', income:'$54k',  rent:'$2.40/sqft', score:88, sat:'very low',  note:'Historic district immediately north of downtown, restoring quickly with the cheapest retail in the urban core.' },
      { id:'northside',  name:'Northside',      x:3, y:0, w:3, h:1, pop:'+4.2%', income:'$61k',  rent:'$2.20/sqft', score:73, sat:'very low',  note:'Port and logistics employment is expanding fast while food and services supply remains minimal.' },
      { id:'mandarin',   name:'Mandarin',       x:2, y:4, w:2, h:2, pop:'+2.3%', income:'$99k',  rent:'$3.60/sqft', score:71, sat:'medium',    note:'Established suburban family spend along San Jose Boulevard; services are thinner than dining.' }
    ],
    businesses: [
      { id:'maplestreet', name:'Maple Street Biscuit Company', emoji:'\u{1F373}', category:'Breakfast restaurant', hood:'San Marco', addr:'2004 San Marco Blvd',
        rating:4.5, reviews:4300, employees:38, priceTier:'$', trend:'rising', health:86, closeRisk:8,
        comp:[ ['Metro Diner','longer hours|multiple sites|dinner service'], ['Another Broken Egg','brunch cocktails|patio'] ] },
      { id:'bearded', name:'Bearded Pig BBQ', emoji:'\u{1F356}', category:'Barbecue', hood:'San Marco', addr:'1224 Kings Ave',
        rating:4.5, reviews:3100, employees:34, priceTier:'$$', trend:'stable', health:79, closeRisk:12,
        comp:[ ['Jenkins Quality Barbecue','institution status|cheaper|multiple sites'], ['Sonny\u2019s BBQ','chain scale|drive-through'] ] },
      { id:'blackshee', name:'Black Sheep Restaurant', emoji:'\u{1F958}', category:'Restaurant', hood:'Riverside', addr:'1534 Oak St',
        rating:4.4, reviews:2900, employees:56, priceTier:'$$', trend:'stable', health:76, closeRisk:14,
        comp:[ ['Orsay','higher rating|Avondale regulars|wine list'], ['Bellwether','downtown lunch trade|newer build'] ] },
      { id:'boldbean', name:'Bold Bean Coffee Roasters', emoji:'\u2615', category:'Coffee shop', hood:'Riverside', addr:'869 Stockton St',
        rating:4.6, reviews:2400, employees:26, priceTier:'$$', trend:'rising', health:87, closeRisk:7,
        comp:[ ['Vagabond Coffee','multiple sites|younger crowd'], ['Southern Roots','food menu|vegan niche'] ] },
      { id:'europeanstreet', name:'European Street Caf\u00e9', emoji:'\u{1F96A}', category:'Cafe', hood:'Riverside', addr:'2753 Park St',
        rating:4.4, reviews:2100, employees:31, priceTier:'$', trend:'declining', health:61, closeRisk:24,
        comp:[ ['Hoptinger','beer programme|later hours|patio'], ['Al\u2019s Pizza','delivery|family trade|cheaper'] ] },
      { id:'safeharbor', name:'Safe Harbor Seafood Market', emoji:'\u{1F41F}', category:'Seafood restaurant', hood:'Mayport', addr:'4378 Ocean St',
        rating:4.6, reviews:5600, employees:42, priceTier:'$$', trend:'declining', health:65, closeRisk:21,
        comp:[ ['Singleton\u2019s Seafood','waterfront seating|longer history'], ['Salt Life Food Shack','beach location|bar programme|tourists'] ] }
    ],
    news: [
      { title:'Four Seasons and Shipyards riverfront district opens first phase downtown', src:'Jacksonville Daily Record \u00b7 6h ago', kind:'housing',
        affected:[ ['Downtown dining',43,'up'], ['Hotels',38,'up'], ['Springfield housing',27,'up'], ['Parking',-21,'down'] ] },
      { title:'JAXPORT completes deepening, container volume projected up 30%', src:'First Coast News \u00b7 1d ago', kind:'housing',
        affected:[ ['Northside logistics jobs',36,'up'], ['Quick service',24,'up'], ['Truck traffic',41,'up'], ['Housing demand',19,'up'] ] }
    ],
    events: [
      { name:'Jaguars vs. Titans', when:'Sunday \u00b7 13:00 \u00b7 EverBank Stadium', attendance:'67,800',
        effects:[ ['Downtown bars','+134%','up'], ['Parking','$45 surge','down'], ['San Marco dining','+38%','up'], ['Traffic on I-95','Severe','down'], ['Hotels','+52%','up'] ] },
      { name:'The Players Championship', when:'Thu-Sun \u00b7 TPC Sawgrass', attendance:'200,000',
        effects:[ ['Ponte Vedra hotels','Sold out','up'], ['Beaches restaurants','+91%','up'], ['Rideshare','+34 min wait','down'], ['Downtown trade','-11%','down'], ['Retail','+47%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Springfield','bigbox'], ['Safe Harbor Seafood closes at Mayport','closure'],
                ['The Fuller Warren Bridge closes lanes for repairs','transit'], ['A 400-unit riverfront tower opens downtown','housing'] ],
    insights:[
      'Springfield sits one mile from downtown at 63% lower rent, and its population is growing faster - the best untapped corridor in Florida.',
      'Beach businesses lose 44% of covers between October and February; those with a local loyalty programme lose only 16%.',
      'Riverside independents that opened before 08:00 grew review velocity 2.4x faster than dinner-only formats this year.'
    ]
  },

};
