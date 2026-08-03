/* Local Radar - US city atlas, ranks 16-20 (US Census estimates, July 1 2025). */

Object.assign(CITY_DATA, {

  /* ===== 16. INDIANAPOLIS, IN ============================================== */
  'indianapolis': {
    rank: 16, name: 'Indianapolis', state: 'IN', pop: '891,484', pulse: 78,
    stats: [ ['Economy',76,'up','green'], ['Hiring',74,'up','green'], ['Construction',81,'up','blue'],
             ['Consumer sentiment',68,'up','green'], ['Competition',48,'flat','orange'], ['Commercial rent',39,'flat','blue'] ],
    districts: [
      { id:'milesquare', name:'Mile Square', x:4, y:2, w:2, h:2, pop:'+3.4%', income:'$79k', rent:'$4.20/sqft', score:73, sat:'medium', note:'Monument Circle and Georgia Street trade is convention driven; residential conversions are adding evening demand.' },
      { id:'massave', name:'Mass Ave', x:5, y:1, w:2, h:1, pop:'+4.2%', income:'$92k', rent:'$4.80/sqft', score:76, sat:'high', note:'The strongest walkable independent corridor in Indiana, now close to fully leased.' },
      { id:'fountainsq', name:'Fountain Square', x:5, y:4, w:2, h:2, pop:'+5.1%', income:'$67k', rent:'$2.90/sqft', score:90, sat:'low', note:'Virginia Avenue and the Cultural Trail deliver Mass Ave demand at 40% lower rent.' },
      { id:'broadripple', name:'Broad Ripple', x:4, y:0, w:2, h:1, pop:'+1.8%', income:'$88k', rent:'$3.80/sqft', score:70, sat:'high', note:'Long-established nightlife district with heavy weekend trade and thin weekday demand.' },
      { id:'fletcherpl', name:'Fletcher Place', x:4, y:4, w:1, h:2, pop:'+4.6%', income:'$96k', rent:'$3.60/sqft', score:85, sat:'medium', note:'Small, dense and quickly gentrifying between downtown and Fountain Square.' },
      { id:'irvington', name:'Irvington', x:7, y:2, w:2, h:2, pop:'+2.4%', income:'$71k', rent:'$2.40/sqft', score:81, sat:'very low', note:'Historic east-side main street with the cheapest walkable retail in the county.' },
      { id:'speedwayin', name:'Speedway', x:1, y:1, w:3, h:2, pop:'+2.9%', income:'$63k', rent:'$2.70/sqft', score:74, sat:'low', note:'Main Street revitalisation next to the Motor Speedway, with enormous but highly seasonal demand.' },
      { id:'castleton', name:'Castleton', x:1, y:4, w:3, h:2, pop:'+3.7%', income:'$84k', rent:'$3.30/sqft', score:68, sat:'medium', note:'North-side suburban retail centre; services outperform dining across the corridor.' }
    ],
    businesses: [
      { id:'stelmosteak', name:"St. Elmo Steak House", emoji:'\u{1F969}', category:'Steakhouse', hood:'Mile Square', addr:'127 S Illinois St',
        rating:4.6, reviews:11800, employees:145, priceTier:'$$$$', trend:'stable', health:86, closeRisk:6,
        comp:[ ['Harry & Izzy\u2019s','sibling concept|lower ticket|faster turns'], ['Prime 47','smaller room|late bar trade'] ] },
      { id:'milktoothin', name:'Milktooth', emoji:'\u{1F373}', category:'Brunch restaurant', hood:'Fletcher Place', addr:'534 Virginia Ave',
        rating:4.5, reviews:3600, employees:38, priceTier:'$$', trend:'rising', health:87, closeRisk:7,
        comp:[ ['Bluebeard','dinner focus|shared ownership|wine list'], ['Cafe Patachou','multiple sites|faster service|scale'] ] },
      { id:'hotelquincy', name:'Amelia\u2019s Bread', emoji:'\u{1F950}', category:'Bakery', hood:'Fletcher Place', addr:'653 Virginia Ave',
        rating:4.6, reviews:1200, employees:17, priceTier:'$$', trend:'rising', health:85, closeRisk:8,
        comp:[ ['Rene\u2019s Bakery','Broad Ripple catchment|longer history'], ['Circle City Sweets','market stall|lower overhead'] ] },
      { id:'hubbardcravens', name:'Hubbard & Cravens Coffee', emoji:'\u2615', category:'Coffee shop', hood:'Broad Ripple', addr:'4930 N Pennsylvania St',
        rating:4.5, reviews:1900, employees:26, priceTier:'$$', trend:'stable', health:75, closeRisk:15,
        comp:[ ['Quills Coffee','multiple sites|specialty focus'], ['Provider','newer build|food menu|Fountain Square'] ] },
      { id:'shapiros', name:"Shapiro's Delicatessen", emoji:'\u{1F96A}', category:'Delicatessen', hood:'South Downtown', addr:'808 S Meridian St',
        rating:4.5, reviews:4200, employees:47, priceTier:'$$', trend:'declining', health:66, closeRisk:20,
        comp:[ ['Goose the Market','specialty retail|smaller format'], ['Yats','price|speed|multiple sites'] ] },
      { id:'lovehandle', name:'Love Handle', emoji:'\u{1F354}', category:'Sandwich shop', hood:'Near Eastside', addr:'877 Massachusetts Ave',
        rating:4.6, reviews:1500, employees:14, priceTier:'$', trend:'declining', health:63, closeRisk:23,
        comp:[ ['Bru Burger Bar','larger room|dinner trade|bar'], ['Chilly Water','beer garden|later hours'] ] }
    ],
    news: [
      { title:'Eli Lilly commits $4.5 billion to Indiana manufacturing and research', src:'Indianapolis Business Journal \u00b7 5h ago', kind:'housing',
        affected:[ ['Downtown dining',34,'up'], ['Housing demand',41,'up'], ['Coffee shops',26,'up'], ['Childcare',31,'up'] ] },
      { title:'Blue Line bus rapid transit breaks ground on Washington Street', src:'Mirror Indy \u00b7 1d ago', kind:'transit',
        affected:[ ['Irvington retail',28,'up'], ['Washington Street trade',-22,'down'], ['Property values',24,'up'], ['Rideshare',19,'up'] ] }
    ],
    events: [
      { name:'Indianapolis 500', when:'Sunday \u00b7 12:45 \u00b7 Indianapolis Motor Speedway', attendance:'300,000',
        effects:[ ['Speedway bars','+420%','up'], ['Hotels','Sold out','up'], ['Parking','$80 surge','down'], ['Downtown dining','+64%','up'], ['Traffic','Gridlock','down'] ] },
      { name:'Gen Con', when:'Four days \u00b7 Indiana Convention Center', attendance:'71,000',
        effects:[ ['Mile Square restaurants','+186%','up'], ['Hotels','Sold out','up'], ['Mass Ave bars','+92%','up'], ['Rideshare','+34 min','down'], ['Retail','+58%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Irvington','bigbox'], ["Shapiro's Delicatessen closes downtown",'closure'],
                ['Washington Street closes for Blue Line work','transit'], ['A 400-unit conversion opens in Mile Square','housing'] ],
    insights:[
      'Fountain Square delivers 79% of Mass Ave foot traffic at 60% of the rent, and it is still adding independents.',
      'Speedway businesses earn 34% of annual revenue in May; those with a year-round format earn 11% and survive downturns better.',
      'Every business on the Cultural Trail gained foot traffic after each extension; those one block off it did not.'
    ]
  },

  /* ===== 17. SAN FRANCISCO, CA ============================================= */
  'san-francisco': {
    rank: 17, name: 'San Francisco', state: 'CA', pop: '827,526', pulse: 72,
    stats: [ ['Economy',74,'up','green'], ['Hiring',81,'up','green'], ['Construction',48,'down','red'],
             ['Consumer sentiment',51,'down','red'], ['Competition',84,'up','orange'], ['Commercial rent',62,'down','green'] ],
    districts: [
      { id:'financialsf', name:'Financial District', x:5, y:2, w:2, h:2, pop:'+1.2%', income:'$146k', rent:'$6.10/sqft', score:58, sat:'medium', note:'Office vacancy is still near record highs, but AI tenants are absorbing space faster than any US market.' },
      { id:'missionsf', name:'Mission District', x:4, y:4, w:2, h:2, pop:'+2.6%', income:'$112k', rent:'$5.40/sqft', score:79, sat:'high', note:'Valencia and 24th Street remain the deepest independent restaurant corridor on the West Coast.' },
      { id:'hayesvalley', name:'Hayes Valley', x:3, y:2, w:1, h:2, pop:'+3.1%', income:'$158k', rent:'$7.20/sqft', score:71, sat:'very high', note:'The centre of the AI startup cluster, with almost no vacancy and premium rents.' },
      { id:'sunsetsf', name:'Outer Sunset', x:0, y:2, w:2, h:3, pop:'+1.8%', income:'$128k', rent:'$3.60/sqft', score:88, sat:'low', note:'Irving and Judah Street offer the cheapest walkable retail in the city with rising young-family demand.' },
      { id:'chinatownsf', name:'Chinatown', x:5, y:1, w:2, h:1, pop:'+0.4%', income:'$62k', rent:'$4.10/sqft', score:64, sat:'high', note:'Dense and historic with heavy tourist reliance; resident-facing formats are underweighted.' },
      { id:'dogpatch', name:'Dogpatch', x:6, y:4, w:2, h:2, pop:'+5.7%', income:'$139k', rent:'$4.70/sqft', score:86, sat:'low', note:'Third Street is adding residents faster than anywhere in the city while retail supply lags.' },
      { id:'bayviewsf', name:'Bayview', x:6, y:5, w:3, h:1, pop:'+3.4%', income:'$84k', rent:'$2.80/sqft', score:82, sat:'very low', note:'Third Street corridor has the lowest rent in the city, T-Line access and very thin supply.' },
      { id:'norsf', name:'North Beach', x:4, y:1, w:1, h:1, pop:'+0.9%', income:'$121k', rent:'$5.90/sqft', score:60, sat:'high', note:'Columbus Avenue is fully leased and tourist dependent, with high tenant churn.' }
    ],
    businesses: [
      { id:'tartinesf', name:'Tartine Bakery', emoji:'\u{1F950}', category:'Bakery', hood:'Mission District', addr:'600 Guerrero St',
        rating:4.5, reviews:9400, employees:96, priceTier:'$$', trend:'stable', health:82, closeRisk:9,
        comp:[ ['Arsicault Bakery','higher rating|croissant specialism|smaller queue'], ['b. patisserie','Pacific Heights catchment|pastry focus'] ] },
      { id:'zunicafe', name:'Zuni Cafe', emoji:'\u{1F357}', category:'Restaurant', hood:'Hayes Valley', addr:'1658 Market St',
        rating:4.5, reviews:3800, employees:74, priceTier:'$$$', trend:'stable', health:78, closeRisk:13,
        comp:[ ['Rich Table','higher rating|tasting format|smaller room'], ['Absinthe','longer hours|bar programme'] ] },
      { id:'lataqueria', name:'La Taqueria', emoji:'\u{1F32E}', category:'Taqueria', hood:'Mission District', addr:'2889 Mission St',
        rating:4.6, reviews:8700, employees:32, priceTier:'$', trend:'rising', health:88, closeRisk:7,
        comp:[ ['El Farolito','24-hour service|cheaper|multiple sites'], ['Taqueria Cancun','later hours|delivery apps'] ] },
      { id:'sightglass', name:'Sightglass Coffee', emoji:'\u2615', category:'Coffee shop', hood:'SoMa', addr:'270 7th St',
        rating:4.4, reviews:3100, employees:44, priceTier:'$$', trend:'declining', health:64, closeRisk:22,
        comp:[ ['Blue Bottle Coffee','scale|multiple sites|brand'], ['Ritual Coffee Roasters','Mission catchment|wholesale'] ] },
      { id:'housedimsum', name:'Good Mong Kok Bakery', emoji:'\u{1F95F}', category:'Dim sum', hood:'Chinatown', addr:'1039 Stockton St',
        rating:4.6, reviews:4300, employees:18, priceTier:'$', trend:'stable', health:80, closeRisk:11,
        comp:[ ['Dim Sum Bistro','seating|card payment'], ['Hong Kong Lounge II','Richmond catchment|full service'] ] },
      { id:'outerlands', name:'Outerlands', emoji:'\u{1F373}', category:'Restaurant', hood:'Outer Sunset', addr:'4001 Judah St',
        rating:4.5, reviews:2900, employees:41, priceTier:'$$', trend:'rising', health:85, closeRisk:9,
        comp:[ ['Hook Fish Co','counter service|lower labour|beach trade'], ['Andytown Coffee','multiple sites|daytime volume'] ] }
    ],
    news: [
      { title:'AI companies lease 5.2 million sq ft, the strongest San Francisco absorption since 2019', src:'San Francisco Chronicle \u00b7 3h ago', kind:'housing',
        affected:[ ['Hayes Valley dining',48,'up'], ['SoMa lunch trade',41,'up'], ['Housing demand',37,'up'], ['Commercial rent',29,'up'] ] },
      { title:'Muni cuts weekend service on five lines to close budget gap', src:'SF Standard \u00b7 1d ago', kind:'transit',
        affected:[ ['Outer Sunset retail',-26,'down'], ['Chinatown trade',-19,'down'], ['Rideshare',34,'up'], ['Downtown weekend traffic',-14,'down'] ] }
    ],
    events: [
      { name:'Outside Lands', when:'Fri-Sun \u00b7 Golden Gate Park', attendance:'225,000',
        effects:[ ['Sunset restaurants','+164%','up'], ['Hotels','+72%','up'], ['Muni N-Judah','+210%','up'], ['Parking','No availability','down'], ['Haight retail','+58%','up'] ] },
      { name:'Giants vs. Dodgers', when:'Tonight \u00b7 18:45 \u00b7 Oracle Park', attendance:'40,100',
        effects:[ ['Mission Bay bars','+118%','up'], ['SoMa dining','+47%','up'], ['Muni crowding','Severe','down'], ['Parking','$55 surge','down'], ['Rideshare','+29 min','down'] ] }
    ],
    scenarios:[ ['Costco opens in Bayview','bigbox'], ['Sightglass closes its SoMa flagship','closure'],
                ['Muni cuts weekend service on five lines','transit'], ['A 500-unit building opens in Dogpatch','housing'] ],
    insights:[
      'The Outer Sunset is the only district in San Francisco where rent fell and independent openings rose in the same year.',
      'Businesses within 150m of a Muni Metro station lost 9% of weekend trade after the last cuts; those relying on bus lines lost 27%.',
      'Every AI office lease over 50,000 sq ft has been followed within two quarters by a rise in nearby coffee shop review velocity.'
    ]
  },

  /* ===== 18. SEATTLE, WA =================================================== */
  'seattle': {
    rank: 18, name: 'Seattle', state: 'WA', pop: '780,995', pulse: 77,
    stats: [ ['Economy',79,'up','green'], ['Hiring',76,'up','green'], ['Construction',71,'flat','blue'],
             ['Consumer sentiment',60,'down','red'], ['Competition',78,'up','orange'], ['Commercial rent',73,'flat','blue'] ],
    districts: [
      { id:'downtownsea', name:'Downtown', x:4, y:2, w:2, h:2, pop:'+2.4%', income:'$118k', rent:'$6.30/sqft', score:61, sat:'medium', note:'Recovering steadily as return-to-office mandates take hold, though street-level vacancy is still elevated.' },
      { id:'capitolhill', name:'Capitol Hill', x:6, y:2, w:2, h:2, pop:'+3.6%', income:'$106k', rent:'$5.20/sqft', score:74, sat:'high', note:'The densest nightlife and independent restaurant district in the Northwest.' },
      { id:'ballard', name:'Ballard', x:3, y:0, w:2, h:2, pop:'+4.1%', income:'$124k', rent:'$4.60/sqft', score:83, sat:'medium', note:'Ballard Avenue combines a strong independent scene with light rail arriving and rent below Capitol Hill.' },
      { id:'fremontsea', name:'Fremont', x:5, y:1, w:1, h:1, pop:'+3.2%', income:'$131k', rent:'$4.90/sqft', score:78, sat:'medium', note:'Adobe and Google campuses give a rare mix of daytime density and neighbourhood character.' },
      { id:'columbiacity', name:'Columbia City', x:5, y:5, w:3, h:1, pop:'+5.3%', income:'$89k', rent:'$3.10/sqft', score:91, sat:'low', note:'Rainier Avenue offers light rail access and the cheapest walkable retail in the city.' },
      { id:'udistrict', name:'University District', x:6, y:0, w:3, h:1, pop:'+4.7%', income:'$54k', rent:'$4.00/sqft', score:76, sat:'high', note:'Light rail plus 50,000 students, with a deep summer trough for dinner-only formats.' },
      { id:'sodo', name:'SODO', x:4, y:4, w:1, h:2, pop:'+1.4%', income:'$77k', rent:'$2.90/sqft', score:69, sat:'very low', note:'Industrial district with stadium event spikes and almost no everyday retail supply.' },
      { id:'westseattle', name:'West Seattle', x:1, y:2, w:3, h:3, pop:'+2.1%', income:'$115k', rent:'$3.80/sqft', score:72, sat:'medium', note:'The Alaska Junction is stable and affluent, though bridge access still shapes trade patterns.' }
    ],
    businesses: [
      { id:'pikeplacechow', name:'Pike Place Chowder', emoji:'\u{1F963}', category:'Seafood counter', hood:'Pike Place Market', addr:'1530 Post Alley',
        rating:4.6, reviews:12800, employees:44, priceTier:'$$', trend:'stable', health:84, closeRisk:8,
        comp:[ ['Ivar\u2019s Acres of Clams','waterfront seating|longer history|scale'], ['Elliott\u2019s Oyster House','full service|higher ticket'] ] },
      { id:'canlis', name:'Canlis', emoji:'\u{1F37D}', category:'Fine dining', hood:'Queen Anne', addr:'2576 Aurora Ave N',
        rating:4.7, reviews:2600, employees:112, priceTier:'$$$$', trend:'stable', health:89, closeRisk:5,
        comp:[ ['The Carlile Room','downtown location|lower ticket'], ['Altura','Capitol Hill tasting menu|smaller room'] ] },
      { id:'paseoseattle', name:'Paseo', emoji:'\u{1F96A}', category:'Sandwich shop', hood:'Fremont', addr:'4225 Fremont Ave N',
        rating:4.6, reviews:5900, employees:23, priceTier:'$', trend:'rising', health:87, closeRisk:7,
        comp:[ ['Un Bien','sibling concept|Ballard location|same recipe'], ['Dick\u2019s Drive-In','price|late hours|scale'] ] },
      { id:'seawolfbakers', name:'Sea Wolf Bakers', emoji:'\u{1F950}', category:'Bakery', hood:'Fremont', addr:'3621 Stone Way N',
        rating:4.6, reviews:1400, employees:21, priceTier:'$$', trend:'rising', health:86, closeRisk:8,
        comp:[ ['Fuji Bakery','multiple sites|Japanese-French range'], ['Columbia City Bakery','south-end catchment|wholesale'] ] },
      { id:'espressovivace', name:'Espresso Vivace', emoji:'\u2615', category:'Coffee shop', hood:'Capitol Hill', addr:'532 Broadway E',
        rating:4.6, reviews:2800, employees:29, priceTier:'$', trend:'stable', health:79, closeRisk:12,
        comp:[ ['Victrola Coffee Roasters','larger seating|wholesale|multiple sites'], ['Anchorhead Coffee','downtown offices|newer build'] ] },
      { id:'thewalrus', name:'The Walrus and the Carpenter', emoji:'\u{1F9AA}', category:'Oyster bar', hood:'Ballard', addr:'4743 Ballard Ave NW',
        rating:4.6, reviews:3400, employees:36, priceTier:'$$$', trend:'declining', health:67, closeRisk:19,
        comp:[ ['The Whale Wins','shared ownership|larger room|dinner focus'], ['Taylor Shellfish','multiple sites|retail attached|cheaper'] ] }
    ],
    news: [
      { title:'Amazon expands Seattle return-to-office to five days, 55,000 staff affected', src:'Seattle Times \u00b7 4h ago', kind:'housing',
        affected:[ ['South Lake Union lunch',52,'up'], ['Downtown coffee',44,'up'], ['Parking',-27,'down'], ['Housing demand',24,'up'] ] },
      { title:'Sound Transit Ballard Link extension enters final design', src:'The Urbanist \u00b7 1d ago', kind:'transit',
        affected:[ ['Ballard property values',36,'up'], ['Interbay retail',29,'up'], ['Construction detours',-21,'down'], ['Bus ridership',18,'up'] ] }
    ],
    events: [
      { name:'Seahawks vs. 49ers', when:'Sunday \u00b7 13:05 \u00b7 Lumen Field', attendance:'68,700',
        effects:[ ['Pioneer Square bars','+196%','up'], ['SODO parking','$70 surge','down'], ['Link light rail','+142%','up'], ['Downtown dining','+51%','up'], ['Hotels','+44%','up'] ] },
      { name:'Bumbershoot', when:'Sat-Sun \u00b7 Seattle Center', attendance:'50,000',
        effects:[ ['Queen Anne dining','+87%','up'], ['Monorail ridership','+164%','up'], ['Parking','Full by 11:00','down'], ['Belltown bars','+62%','up'], ['Retail','+29%','up'] ] }
    ],
    scenarios:[ ['Costco opens in SODO','bigbox'], ['The Walrus and the Carpenter closes in Ballard','closure'],
                ['Sound Transit closes the Ballard Bridge approach','transit'], ['A 550-unit building opens in Capitol Hill','housing'] ],
    insights:[
      'Columbia City has light rail access and 40% lower rent than Capitol Hill, and it is the only district adding independents on both.',
      'Businesses that added weekday lunch service gained 31% revenue after the return-to-office change; dinner-only formats gained 4%.',
      'Every Ballard Avenue business that survived the bridge closure had at least 30% of revenue from within one mile.'
    ]
  },

  /* ===== 19. DENVER, CO ==================================================== */
  'denver': {
    rank: 19, name: 'Denver', state: 'CO', pop: '729,019', pulse: 81,
    stats: [ ['Economy',80,'up','green'], ['Hiring',75,'up','green'], ['Construction',83,'up','blue'],
             ['Consumer sentiment',67,'flat','blue'], ['Competition',76,'up','orange'], ['Commercial rent',64,'flat','blue'] ],
    districts: [
      { id:'lodo', name:'LoDo', x:4, y:2, w:2, h:2, pop:'+2.9%', income:'$109k', rent:'$5.90/sqft', score:64, sat:'high', note:'Union Station and Coors Field drive strong event trade, with premium rent and high churn.' },
      { id:'rino', name:'RiNo', x:6, y:1, w:2, h:2, pop:'+6.8%', income:'$98k', rent:'$4.70/sqft', score:85, sat:'medium', note:'Larimer and Walnut are the fastest developing corridors in the Mountain West, still under $5.' },
      { id:'highlandsden', name:'Highland', x:3, y:1, w:1, h:2, pop:'+3.4%', income:'$127k', rent:'$5.10/sqft', score:76, sat:'high', note:'32nd Avenue and Tennyson Street offer dense, affluent, walkable demand with rare vacancy.' },
      { id:'baker', name:'Baker', x:4, y:4, w:2, h:2, pop:'+3.1%', income:'$92k', rent:'$3.80/sqft', score:84, sat:'medium', note:'South Broadway is the deepest independent strip in the city at 35% below LoDo rent.' },
      { id:'cherrycreek', name:'Cherry Creek', x:6, y:3, w:2, h:2, pop:'+2.2%', income:'$168k', rent:'$8.20/sqft', score:52, sat:'very high', note:'Highest income and highest rent in the metro, with national-brand leasing dominant.' },
      { id:'fivepoints', name:'Five Points', x:5, y:1, w:1, h:1, pop:'+4.6%', income:'$79k', rent:'$3.30/sqft', score:88, sat:'low', note:'Welton Street has historic character, light rail and the cheapest space near downtown.' },
      { id:'westwood', name:'Westwood', x:1, y:3, w:3, h:2, pop:'+2.7%', income:'$54k', rent:'$2.20/sqft', score:79, sat:'very low', note:'Morrison Road corridor has the lowest rent in Denver and a large, underserved population.' },
      { id:'stapletonden', name:'Central Park', x:6, y:0, w:3, h:1, pop:'+5.4%', income:'$134k', rent:'$4.20/sqft', score:82, sat:'low', note:'Master-planned district with heavy family spend and retail supply still behind rooftops.' }
    ],
    businesses: [
      { id:'buckhorn', name:'Buckhorn Exchange', emoji:'\u{1F969}', category:'Steakhouse', hood:'La Alma', addr:'1000 Osage St',
        rating:4.5, reviews:4400, employees:52, priceTier:'$$$', trend:'stable', health:77, closeRisk:13,
        comp:[ ['Guard and Grace','downtown location|modern room|larger bar'], ['Elway\u2019s','Cherry Creek affluence|brand recognition'] ] },
      { id:'safta', name:'Safta', emoji:'\u{1F958}', category:'Israeli restaurant', hood:'RiNo', addr:'3330 Brighton Blvd',
        rating:4.6, reviews:3100, employees:64, priceTier:'$$$', trend:'rising', health:88, closeRisk:6,
        comp:[ ['Tavernetta','Union Station traffic|Italian niche'], ['Hop Alley','RiNo neighbour|smaller room|cult following'] ] },
      { id:'sweetbloom', name:'Sweet Bloom Coffee Roasters', emoji:'\u2615', category:'Coffee shop', hood:'Lakewood', addr:'1619 Reed St',
        rating:4.7, reviews:1300, employees:19, priceTier:'$$', trend:'rising', health:89, closeRisk:5,
        comp:[ ['Huckleberry Roasters','multiple sites|RiNo presence'], ['Corvus Coffee','south Denver catchment|wholesale'] ] },
      { id:'rosenbergs', name:"Rosenberg's Bagels", emoji:'\u{1F96F}', category:'Bagel shop', hood:'Five Points', addr:'725 E 26th Ave',
        rating:4.5, reviews:3600, employees:33, priceTier:'$', trend:'stable', health:78, closeRisk:13,
        comp:[ ['Call Your Mother','newer brand|colourful format|multiple sites'], ['Bagel Deli','longer history|cheaper'] ] },
      { id:'watercourse', name:'Watercourse Foods', emoji:'\u{1F957}', category:'Vegetarian restaurant', hood:'Uptown', addr:'837 E 17th Ave',
        rating:4.5, reviews:2900, employees:41, priceTier:'$$', trend:'declining', health:65, closeRisk:21,
        comp:[ ['City O\u2019 City','shared ownership|late hours|bar programme'], ['Somebody People','Baker location|higher rating'] ] },
      { id:'deniceden', name:'Little Man Ice Cream', emoji:'\u{1F366}', category:'Ice cream shop', hood:'Highland', addr:'2620 16th St',
        rating:4.6, reviews:7200, employees:48, priceTier:'$', trend:'declining', health:69, closeRisk:17,
        comp:[ ['Sweet Cooie\u2019s','sibling brand|Congress Park catchment'], ['Bonnie Brae Ice Cream','longer history|parking'] ] }
    ],
    news: [
      { title:'Denver approves 16th Street Mall reopening after four-year reconstruction', src:'Denver Post \u00b7 4h ago', kind:'housing',
        affected:[ ['Downtown retail',46,'up'], ['LoDo dining',33,'up'], ['Foot traffic',52,'up'], ['Construction detours',-38,'down'] ] },
      { title:'RTD adds frequency on the E and W light rail lines from September', src:'Denverite \u00b7 1d ago', kind:'transit',
        affected:[ ['Five Points retail',27,'up'], ['Westwood access',22,'up'], ['Parking demand',-14,'down'], ['Bus ridership',16,'up'] ] }
    ],
    events: [
      { name:'Nuggets vs. Lakers', when:'Tonight \u00b7 19:00 \u00b7 Ball Arena', attendance:'19,500',
        effects:[ ['LoDo bars','+124%','up'], ['Union Station dining','+58%','up'], ['Parking','$45 surge','down'], ['Light rail','+81%','up'], ['Retail','+11%','up'] ] },
      { name:'Great American Beer Festival', when:'Thu-Sat \u00b7 Colorado Convention Center', attendance:'40,000',
        effects:[ ['Downtown bars','+167%','up'], ['Hotels','+74%','up'], ['RiNo taprooms','+92%','up'], ['Rideshare','+37 min','down'], ['Restaurants','+63%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Westwood','bigbox'], ['Watercourse Foods closes in Uptown','closure'],
                ['RTD closes the E Line for track work','transit'], ['A 450-unit building opens in RiNo','housing'] ],
    insights:[
      'Five Points has light rail, downtown adjacency and 44% lower rent than LoDo - the strongest untapped corridor in the metro.',
      'RiNo has added more restaurant seats in three years than the rest of Denver combined, and its closure rate is now rising fastest.',
      'Businesses on South Broadway with patios grew review velocity 2.1x faster than those without through the last two winters.'
    ]
  },

  /* ===== 20. NASHVILLE, TN ================================================= */
  'nashville': {
    rank: 20, name: 'Nashville', state: 'TN', pop: '715,884', pulse: 88,
    stats: [ ['Economy',87,'up','green'], ['Hiring',84,'up','green'], ['Construction',92,'up','blue'],
             ['Consumer sentiment',75,'up','green'], ['Competition',82,'up','orange'], ['Commercial rent',77,'up','orange'] ],
    districts: [
      { id:'broadwaynash', name:'Lower Broadway', x:4, y:2, w:2, h:2, pop:'+2.1%', income:'$74k', rent:'$9.10/sqft', score:39, sat:'very high', note:'The highest rent per square foot in the South, entirely tourist dependent and fully saturated.' },
      { id:'thegulch', name:'The Gulch', x:3, y:3, w:1, h:2, pop:'+5.6%', income:'$121k', rent:'$7.30/sqft', score:57, sat:'very high', note:'Dense new residential with premium ground-floor rents and national-brand leasing.' },
      { id:'eastnash', name:'East Nashville', x:6, y:2, w:2, h:2, pop:'+4.9%', income:'$88k', rent:'$4.10/sqft', score:89, sat:'medium', note:'Five Points and Eastland Avenue hold the strongest independent scene in the city at half Gulch rent.' },
      { id:'12south', name:'12 South', x:4, y:4, w:2, h:2, pop:'+3.2%', income:'$132k', rent:'$6.20/sqft', score:63, sat:'high', note:'Highly successful and now expensive, with limited space and heavy visitor traffic.' },
      { id:'germantownnash', name:'Germantown', x:4, y:1, w:2, h:1, pop:'+4.4%', income:'$118k', rent:'$5.40/sqft', score:72, sat:'high', note:'Compact historic district next to the ballpark with strong dining density and rare vacancy.' },
      { id:'wedgewoodhouston', name:'Wedgewood-Houston', x:4, y:5, w:3, h:1, pop:'+7.3%', income:'$79k', rent:'$3.20/sqft', score:92, sat:'low', note:'Warehouse conversions south of downtown with the cheapest core-adjacent space in the city.' },
      { id:'antiochnash', name:'Antioch', x:6, y:4, w:3, h:2, pop:'+6.1%', income:'$63k', rent:'$2.30/sqft', score:81, sat:'very low', note:'The most internationally diverse district in Tennessee, with very thin retail supply.' },
      { id:'sylvanpark', name:'Sylvan Park', x:1, y:2, w:3, h:2, pop:'+2.6%', income:'$114k', rent:'$4.40/sqft', score:75, sat:'medium', note:'Murphy Road and Charlotte Avenue serve stable family demand west of downtown.' }
    ],
    businesses: [
      { id:'princeshot', name:"Prince's Hot Chicken", emoji:'\u{1F525}', category:'Fried chicken', hood:'Nolensville Pike', addr:'5814 Nolensville Pike',
        rating:4.5, reviews:5800, employees:36, priceTier:'$', trend:'stable', health:82, closeRisk:10,
        comp:[ ['Hattie B\u2019s','multiple sites|faster service|tourist placement'], ['Bolton\u2019s Spicy Chicken','cheaper|local following'] ] },
      { id:'arnoldscountry', name:"Arnold's Country Kitchen", emoji:'\u{1F35B}', category:'Meat-and-three', hood:'Wedgewood-Houston', addr:'605 8th Ave S',
        rating:4.6, reviews:4100, employees:28, priceTier:'$', trend:'declining', health:66, closeRisk:22,
        comp:[ ['Monell\u2019s','family-style format|Germantown location'], ['Swett\u2019s','longer hours|north Nashville catchment'] ] },
      { id:'rolfanddaughters', name:'Rolf and Daughters', emoji:'\u{1F35D}', category:'Italian restaurant', hood:'Germantown', addr:'700 Taylor St',
        rating:4.6, reviews:2700, employees:59, priceTier:'$$$', trend:'stable', health:84, closeRisk:9,
        comp:[ ['Henrietta Red','Germantown neighbour|oyster programme'], ['Bastion','smaller room|tasting format|cult following'] ] },
      { id:'barista_parlor', name:'Barista Parlor', emoji:'\u2615', category:'Coffee shop', hood:'East Nashville', addr:'519B Gallatin Ave',
        rating:4.5, reviews:3400, employees:47, priceTier:'$$', trend:'rising', health:86, closeRisk:8,
        comp:[ ['Crema Coffee Roasters','wholesale|downtown adjacency'], ['Steadfast Coffee','Germantown location|food menu'] ] },
      { id:'dozenbakery', name:'Dozen Bakery', emoji:'\u{1F950}', category:'Bakery', hood:'Wedgewood-Houston', addr:'516 Hagan St',
        rating:4.5, reviews:1600, employees:24, priceTier:'$$', trend:'rising', health:85, closeRisk:9,
        comp:[ ['Sweet 16th','East Nashville regulars|smaller format'], ['Five Daughters Bakery','multiple sites|doughnut niche|tourist trade'] ] },
      { id:'robertswestern', name:"Robert's Western World", emoji:'\u{1F3B8}', category:'Honky-tonk', hood:'Lower Broadway', addr:'416 Broadway',
        rating:4.7, reviews:9600, employees:42, priceTier:'$', trend:'declining', health:70, closeRisk:18,
        comp:[ ['Tootsies Orchid Lounge','multiple floors|larger capacity'], ['Celebrity-branded bars','rooftops|marketing budget|newer build'] ] }
    ],
    news: [
      { title:'Oracle begins moving staff into East Bank campus, 8,500 jobs planned', src:'Tennessean \u00b7 3h ago', kind:'housing',
        affected:[ ['East Nashville dining',44,'up'], ['Housing demand',56,'up'], ['Coffee shops',33,'up'], ['Commercial rent',37,'up'] ] },
      { title:'Choose How You Move transit plan begins Murfreesboro Pike corridor work', src:'Nashville Banner \u00b7 1d ago', kind:'transit',
        affected:[ ['Antioch retail',31,'up'], ['Nolensville Pike trade',-17,'down'], ['Property values',26,'up'], ['Bus ridership',23,'up'] ] }
    ],
    events: [
      { name:'CMA Fest', when:'Four days \u00b7 Downtown and Nissan Stadium', attendance:'90,000',
        effects:[ ['Broadway bars','+340%','up'], ['Hotels','Sold out','up'], ['Street closures','20+ blocks','down'], ['East Nashville dining','+47%','up'], ['Rideshare','+58 min','down'] ] },
      { name:'Titans vs. Colts', when:'Sunday \u00b7 13:00 \u00b7 Nissan Stadium', attendance:'69,100',
        effects:[ ['East Bank bars','+165%','up'], ['Broadway dining','+88%','up'], ['Parking','$65 surge','down'], ['Pedestrian bridge','At capacity','down'], ['Hotels','+53%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Antioch','bigbox'], ["Arnold's Country Kitchen closes in Wedgewood-Houston",'closure'],
                ['Broadway closes to traffic for four months','transit'], ['A 700-unit East Bank tower opens','housing'] ],
    insights:[
      'Wedgewood-Houston sits one mile from Broadway at 65% lower rent, and it is the only core-adjacent district still adding independents.',
      'Broadway venues earn 63% of revenue from visitors; East Nashville businesses earn 81% from residents and are far less cyclical.',
      'Antioch has the most diverse restaurant mix in Tennessee and the fewest food businesses per resident of any district tracked here.'
    ]
  }

});
