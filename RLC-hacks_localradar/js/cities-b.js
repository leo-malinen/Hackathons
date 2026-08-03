/* Local Radar - US city atlas, ranks 11-20 (US Census estimates, July 1 2025).
   All neighborhoods, businesses, venues and news anchors are real places.
   Scores, timelines and forecasts are deterministic simulations. */

Object.assign(CITY_DATA, {

  /* ===== 11. FORT WORTH, TX ================================================ */
  'fort-worth': {
    rank: 11, name: 'Fort Worth', state: 'TX', pop: '1,008,106', pulse: 89,
    stats: [ ['Economy',88,'up','green'], ['Hiring',85,'up','green'], ['Construction',94,'up','blue'],
             ['Consumer sentiment',74,'up','green'], ['Competition',49,'flat','orange'], ['Commercial rent',51,'up','orange'] ],
    districts: [
      { id:'sundance', name:'Sundance Square', x:4, y:2, w:2, h:2, pop:'+3.4%', income:'$86k', rent:'$5.40/sqft', score:66, sat:'high', note:'The walkable downtown core is fully leased and event driven; weekday lunch is the reliable trade.' },
      { id:'nearsouth', name:'Near Southside', x:4, y:4, w:2, h:2, pop:'+4.9%', income:'$71k', rent:'$3.20/sqft', score:90, sat:'low', note:'Magnolia Avenue has an established independent scene with rent barely half of downtown - the best entry point in the city.' },
      { id:'stockyards', name:'Stockyards', x:4, y:0, w:2, h:2, pop:'+2.1%', income:'$64k', rent:'$6.20/sqft', score:52, sat:'very high', note:'Heavy tourist volume and the highest rent in the city; almost no resident-facing supply survives here.' },
      { id:'westseventh', name:'West 7th', x:2, y:2, w:2, h:2, pop:'+3.8%', income:'$94k', rent:'$5.10/sqft', score:63, sat:'high', note:'Dense nightlife with high tenant churn; daytime formats are consistently the thin category.' },
      { id:'tcuarea', name:'TCU / University', x:2, y:4, w:2, h:2, pop:'+2.6%', income:'$102k', rent:'$4.70/sqft', score:72, sat:'medium', note:'Reliable student and alumni spend nine months a year, with a deep summer trough.' },
      { id:'alliance', name:'Alliance', x:5, y:0, w:4, h:1, pop:'+8.4%', income:'$96k', rent:'$3.10/sqft', score:93, sat:'very low', note:'The fastest growing district in this atlas - logistics and rooftops are far ahead of retail supply.' },
      { id:'polytechnic', name:'Polytechnic Heights', x:6, y:3, w:2, h:2, pop:'+1.7%', income:'$43k', rent:'$1.80/sqft', score:64, sat:'very low', note:'Lowest rent tracked anywhere in this atlas, paired with a large and underserved population.' },
      { id:'clearfork', name:'Clearfork', x:0, y:2, w:2, h:3, pop:'+5.2%', income:'$148k', rent:'$6.80/sqft', score:70, sat:'medium', note:'High-income riverside development that is still adding space, unlike most affluent districts.' }
    ],
    businesses: [
      { id:'joetgarcias', name:"Joe T. Garcia's", emoji:'\u{1F32E}', category:'Mexican restaurant', hood:'North Side', addr:'2201 N Commerce St',
        rating:4.4, reviews:14200, employees:190, priceTier:'$$', trend:'stable', health:81, closeRisk:10,
        comp:[ ['Los Molcajetes','card accepted|cheaper|neighbourhood regulars'], ['Revolver Taco Lounge','higher rating|smaller room'] ] },
      { id:'heim', name:'Heim Barbecue', emoji:'\u{1F356}', category:'Barbecue', hood:'Near Southside', addr:'1109 W Magnolia Ave',
        rating:4.6, reviews:6800, employees:64, priceTier:'$$', trend:'rising', health:89, closeRisk:6,
        comp:[ ['Panther City BBQ','higher rating|smaller queue|Tex-Mex crossover'], ['Goldee\u2019s Barbecue','national ranking|limited days'] ] },
      { id:'brewedfw', name:'Brewed', emoji:'\u2615', category:'Coffee shop', hood:'Near Southside', addr:'801 W Magnolia Ave',
        rating:4.5, reviews:2300, employees:28, priceTier:'$$', trend:'rising', health:84, closeRisk:9,
        comp:[ ['Avoca Coffee Roasters','roastery|wholesale|multiple sites'], ['Craftwork Coffee','co-working model|longer hours'] ] },
      { id:'reatafw', name:'Reata Restaurant', emoji:'\u{1F969}', category:'Steakhouse', hood:'Sundance Square', addr:'310 Houston St',
        rating:4.5, reviews:5100, employees:98, priceTier:'$$$', trend:'stable', health:78, closeRisk:13,
        comp:[ ['Cattlemen\u2019s Steak House','Stockyards footfall|longer history'], ['Grace','modern room|higher ticket'] ] },
      { id:'blackrooster', name:'Black Rooster Bakery', emoji:'\u{1F950}', category:'Bakery', hood:'Near Southside', addr:'2430 Forest Park Blvd',
        rating:4.6, reviews:1300, employees:19, priceTier:'$$', trend:'stable', health:76, closeRisk:15,
        comp:[ ['Stir Crazy Baked Goods','vegan range|Near Southside overlap'], ['Carshon\u2019s Deli','lunch trade|longer history'] ] },
      { id:'hgsply', name:'HG Sply Co', emoji:'\u{1F958}', category:'Restaurant', hood:'West 7th', addr:'1621 River Run',
        rating:4.2, reviews:3400, employees:71, priceTier:'$$', trend:'declining', health:59, closeRisk:27,
        comp:[ ['Press Cafe','riverside patio|breakfast trade'], ['Clearfork newcomers','newer build|affluent catchment|parking'] ] }
    ],
    news: [
      { title:'Alliance Texas adds 4 million sq ft of logistics space, 6,000 jobs projected', src:'Fort Worth Report \u00b7 5h ago', kind:'housing',
        affected:[ ['North Fort Worth dining',41,'up'], ['Quick service',48,'up'], ['Housing demand',52,'up'], ['Truck traffic',33,'up'] ] },
      { title:'Panther Island flood control channel reaches halfway mark', src:'Star-Telegram \u00b7 1d ago', kind:'housing',
        affected:[ ['Near Southside property',29,'up'], ['Stockyards trade',12,'up'], ['Construction detours',-18,'down'], ['Downtown parking',-14,'down'] ] }
    ],
    events: [
      { name:'Fort Worth Stock Show and Rodeo', when:'23 days \u00b7 Dickies Arena', attendance:'1.2M',
        effects:[ ['Stockyards restaurants','+240%','up'], ['Hotels','+78%','up'], ['Parking','$35 surge','down'], ['Near Southside dining','+31%','up'], ['Traffic','Severe','down'] ] },
      { name:'Main Street Arts Festival', when:'Thu-Sun \u00b7 Downtown', attendance:'400,000',
        effects:[ ['Sundance Square bars','+164%','up'], ['Street closures','14 blocks','down'], ['Cafes','+72%','up'], ['Retail','+55%','up'], ['Rideshare','+27 min','down'] ] }
    ],
    scenarios:[ ['Costco opens in Polytechnic Heights','bigbox'], ['HG Sply Co closes in West 7th','closure'],
                ['I-35W lanes close through downtown','transit'], ['A 600-unit development opens at Alliance','housing'] ],
    insights:[
      'Alliance is adding rooftops 4.1x faster than retail permits are filed - the largest supply gap measured in this atlas.',
      'Near Southside now matches West 7th on weekend foot traffic at 37% lower rent, and its tenant churn is a third as high.',
      'Every barbecue business in the metro that opened a second location kept its rating; three of five that added delivery lost half a star.'
    ]
  },

  /* ===== 12. AUSTIN, TX ==================================================== */
  'austin': {
    rank: 12, name: 'Austin', state: 'TX', pop: '993,588', pulse: 84,
    stats: [ ['Economy',83,'up','green'], ['Hiring',69,'down','red'], ['Construction',88,'up','blue'],
             ['Consumer sentiment',66,'down','red'], ['Competition',89,'up','orange'], ['Commercial rent',79,'down','green'] ],
    districts: [
      { id:'downtownatx', name:'Downtown', x:4, y:2, w:2, h:2, pop:'+4.1%', income:'$118k', rent:'$7.90/sqft', score:54, sat:'very high', note:'Congress Avenue and Rainey Street are saturated, with the highest rent and highest churn in Texas.' },
      { id:'eastaustin', name:'East Austin', x:6, y:2, w:2, h:2, pop:'+5.6%', income:'$95k', rent:'$5.30/sqft', score:75, sat:'high', note:'East Sixth and Manor Road are still adding independents, though rent has doubled since 2019.' },
      { id:'southcongress', name:'South Congress', x:4, y:4, w:2, h:2, pop:'+2.4%', income:'$109k', rent:'$8.40/sqft', score:47, sat:'very high', note:'National retail has taken most of the corridor; independent operators are being priced out.' },
      { id:'muellerdist', name:'Mueller', x:5, y:0, w:3, h:2, pop:'+6.3%', income:'$127k', rent:'$4.60/sqft', score:88, sat:'low', note:'Master-planned district with dense rooftops, family spend and retail supply still catching up.' },
      { id:'southlamar', name:'South Lamar', x:3, y:4, w:1, h:2, pop:'+3.9%', income:'$101k', rent:'$5.70/sqft', score:69, sat:'high', note:'Strong evening trade but the corridor is now dominated by apartment ground-floor space at premium rents.' },
      { id:'northloop', name:'North Loop', x:3, y:1, w:1, h:1, pop:'+2.2%', income:'$88k', rent:'$3.90/sqft', score:79, sat:'medium', note:'Small, quirky and reliably busy; one of the last corridors under $4 inside the loop.' },
      { id:'stelmo', name:'St. Elmo / South Austin', x:3, y:5, w:4, h:1, pop:'+7.1%', income:'$84k', rent:'$3.30/sqft', score:91, sat:'very low', note:'Warehouse conversions south of Ben White with the cheapest usable space near the core.' },
      { id:'domainatx', name:'The Domain', x:1, y:1, w:2, h:2, pop:'+5.8%', income:'$134k', rent:'$6.90/sqft', score:62, sat:'high', note:'A second downtown with major office tenants, but leasing is national-chain dominated.' }
    ],
    businesses: [
      { id:'franklinbbq', name:'Franklin Barbecue', emoji:'\u{1F356}', category:'Barbecue', hood:'East Austin', addr:'900 E 11th St',
        rating:4.6, reviews:13800, employees:58, priceTier:'$$', trend:'stable', health:87, closeRisk:6,
        comp:[ ['la Barbecue','no queue|full bar|East Austin overlap'], ['Terry Black\u2019s','longer hours|larger capacity|no wait'] ] },
      { id:'veracruz', name:'Veracruz All Natural', emoji:'\u{1F32E}', category:'Taqueria', hood:'East Austin', addr:'1704 E Cesar Chavez St',
        rating:4.6, reviews:9200, employees:74, priceTier:'$', trend:'rising', health:88, closeRisk:7,
        comp:[ ['Nixta Taqueria','award coverage|higher ticket'], ['Torchy\u2019s Tacos','scale|drive-through|late hours'] ] },
      { id:'juniper', name:'Juniper', emoji:'\u{1F37D}', category:'Italian restaurant', hood:'East Austin', addr:'2400 E Cesar Chavez St',
        rating:4.5, reviews:1800, employees:52, priceTier:'$$$', trend:'declining', health:63, closeRisk:24,
        comp:[ ['Intero','neighbourhood regulars|smaller room|lower rent'], ['Uchi','brand recognition|higher ticket|reservations'] ] },
      { id:'jospcoffee', name:"Jo's Coffee", emoji:'\u2615', category:'Coffee shop', hood:'South Congress', addr:'1300 S Congress Ave',
        rating:4.5, reviews:6400, employees:41, priceTier:'$', trend:'stable', health:77, closeRisk:14,
        comp:[ ['Radio Coffee & Beer','beer programme|food trucks|later hours'], ['Merit Coffee','multiple sites|office trade'] ] },
      { id:'easyriderbakery', name:'Easy Tiger', emoji:'\u{1F950}', category:'Bakery and beer garden', hood:'Downtown', addr:'709 E 6th St',
        rating:4.4, reviews:5300, employees:83, priceTier:'$$', trend:'declining', health:61, closeRisk:26,
        comp:[ ['Swedish Hill','bakery focus|multiple sites|lower rent'], ['ThunderCloud Subs','price|speed|scale'] ] },
      { id:'launderette', name:'Launderette', emoji:'\u{1F958}', category:'Restaurant', hood:'East Austin', addr:'2115 Holly St',
        rating:4.5, reviews:2600, employees:47, priceTier:'$$$', trend:'stable', health:75, closeRisk:16,
        comp:[ ['Birdie\u2019s','counter service|lower labour cost|cult following'], ['Odd Duck','South Lamar catchment|tasting menu'] ] }
    ],
    news: [
      { title:'Tesla and Samsung expansions slow, Austin office vacancy hits record 23%', src:'Austin Business Journal \u00b7 4h ago', kind:'closure',
        affected:[ ['Downtown lunch trade',-27,'down'], ['Coffee shops',-19,'down'], ['Commercial rent',-14,'down'], ['Sublease supply',38,'up'] ] },
      { title:'Project Connect Blue Line construction begins along Riverside Drive', src:'KUT \u00b7 1d ago', kind:'transit',
        affected:[ ['Riverside retail',-31,'down'], ['East Austin trade',-12,'down'], ['Property values',26,'up'], ['Rideshare',22,'up'] ] }
    ],
    events: [
      { name:'South by Southwest', when:'Nine days \u00b7 Downtown', attendance:'300,000',
        effects:[ ['Downtown bars','+280%','up'], ['Hotels','Sold out','up'], ['Rideshare','+72 min wait','down'], ['East Austin dining','+94%','up'], ['Street closures','30+ blocks','down'] ] },
      { name:'Austin City Limits Music Festival', when:'Two weekends \u00b7 Zilker Park', attendance:'450,000',
        effects:[ ['South Lamar bars','+147%','up'], ['Zilker parking','Closed','down'], ['Hotels','+88%','up'], ['Downtown retail','+41%','up'], ['Traffic','Gridlock','down'] ] }
    ],
    scenarios:[ ['Costco opens in St. Elmo','bigbox'], ['Juniper closes on East Cesar Chavez','closure'],
                ['Project Connect closes Riverside Drive lanes','transit'], ['A 700-unit tower opens downtown','housing'] ],
    insights:[
      'Austin is the only city in this atlas where commercial rent is falling while population still grows - a tenant\u2019s market for the first time since 2015.',
      'St. Elmo offers 61% lower rent than South Congress within four miles, and it is the only south-side corridor still adding independents.',
      'Restaurants that opened during the 2021-2022 boom have a 2.4x higher closure rate than those that opened before 2019 or after 2023.'
    ]
  },

  /* ===== 13. SAN JOSE, CA ================================================== */
  'san-jose': {
    rank: 13, name: 'San Jose', state: 'CA', pop: '997,368', pulse: 80,
    stats: [ ['Economy',81,'up','green'], ['Hiring',86,'up','green'], ['Construction',67,'flat','blue'],
             ['Consumer sentiment',58,'down','red'], ['Competition',72,'up','orange'], ['Commercial rent',84,'up','orange'] ],
    districts: [
      { id:'downtownsj', name:'Downtown San Jose', x:3, y:2, w:3, h:2, pop:'+2.8%', income:'$104k', rent:'$5.60/sqft', score:69, sat:'medium', note:'Google Downtown West and SJSU keep daytime demand steady, but evening trade is still thin.' },
      { id:'japantown', name:'Japantown', x:6, y:1, w:2, h:2, pop:'+2.1%', income:'$112k', rent:'$4.30/sqft', score:78, sat:'medium', note:'One of only three historic Japantowns left in the United States, with strong loyalty and modest rent.' },
      { id:'santanarow', name:'Santana Row', x:5, y:4, w:2, h:2, pop:'+3.6%', income:'$156k', rent:'$8.90/sqft', score:48, sat:'very high', note:'The highest rent in the county with almost no independent tenancy remaining.' },
      { id:'willowglen', name:'Willow Glen', x:2, y:4, w:3, h:2, pop:'+1.4%', income:'$168k', rent:'$5.20/sqft', score:74, sat:'medium', note:'Lincoln Avenue supports affluent, walkable family spend with rare turnover.' },
      { id:'alumrock', name:'Alum Rock / East Side', x:0, y:1, w:3, h:3, pop:'+3.2%', income:'$92k', rent:'$2.70/sqft', score:87, sat:'very low', note:'Story and King Road corridors have the cheapest retail in the county and a large underserved population.' },
      { id:'northsj', name:'North San Jose', x:7, y:3, w:2, h:3, pop:'+5.4%', income:'$149k', rent:'$4.80/sqft', score:83, sat:'low', note:'Dense tech employment with very little walkable retail supply - the clearest structural gap in the city.' },
      { id:'berryessa', name:'Berryessa', x:6, y:0, w:3, h:1, pop:'+4.1%', income:'$138k', rent:'$4.10/sqft', score:81, sat:'low', note:'BART extension has raised access, though retail development has not yet followed.' },
      { id:'westgatesj', name:'Westgate', x:0, y:4, w:2, h:2, pop:'+1.1%', income:'$147k', rent:'$3.90/sqft', score:64, sat:'medium', note:'Stable suburban strip trade; services outperform dining here.' }
    ],
    businesses: [
      { id:'falafeldrivein', name:"Falafel's Drive-In", emoji:'\u{1F959}', category:'Fast food', hood:'Willow Glen', addr:'2301 Stevens Creek Blvd',
        rating:4.5, reviews:5200, employees:26, priceTier:'$', trend:'stable', health:80, closeRisk:11,
        comp:[ ['Zeni Ethiopian','different cuisine|dinner trade'], ['In-N-Out','drive-through|scale|price'] ] },
      { id:'originalgravity', name:'Original Gravity Public House', emoji:'\u{1F37A}', category:'Gastropub', hood:'Downtown San Jose', addr:'66 S 1st St',
        rating:4.4, reviews:2100, employees:33, priceTier:'$$', trend:'stable', health:73, closeRisk:17,
        comp:[ ['Haberdasher','cocktail focus|later hours'], ['San Pedro Square Market','food hall variety|parking'] ] },
      { id:'shukusushi', name:'Kaita Sushi', emoji:'\u{1F363}', category:'Sushi restaurant', hood:'Japantown', addr:'215 Jackson St',
        rating:4.7, reviews:900, employees:14, priceTier:'$$$', trend:'rising', health:88, closeRisk:6,
        comp:[ ['Sushi Confidential','Santana Row footfall|larger room'], ['Kazoo Restaurant','Japantown neighbour|longer history'] ] },
      { id:'chromatic', name:'Chromatic Coffee', emoji:'\u2615', category:'Coffee shop', hood:'Downtown San Jose', addr:'40 S 1st St',
        rating:4.5, reviews:1500, employees:22, priceTier:'$$', trend:'rising', health:84, closeRisk:9,
        comp:[ ['Voyager Craft Coffee','multiple sites|drive-through'], ['Bellano Coffee','SJSU catchment|cheaper'] ] },
      { id:'sanpedrosq', name:'San Pedro Square Market', emoji:'\u{1F3EA}', category:'Food hall', hood:'Downtown San Jose', addr:'87 N San Pedro St',
        rating:4.5, reviews:11600, employees:220, priceTier:'$$', trend:'stable', health:79, closeRisk:12,
        comp:[ ['Santana Row','affluent catchment|parking|national brands'], ['Eastridge','indoor mall|weather independent'] ] },
      { id:'backabuddy', name:'Back A Yard Caribbean Grill', emoji:'\u{1F357}', category:'Caribbean restaurant', hood:'Downtown San Jose', addr:'80 N Market St',
        rating:4.4, reviews:4300, employees:38, priceTier:'$$', trend:'declining', health:64, closeRisk:22,
        comp:[ ['Vito\u2019s Trattoria','lunch trade|office proximity'], ['Nick the Greek','multiple sites|price|speed'] ] }
    ],
    news: [
      { title:'Google Downtown West phase one construction resumes after two-year pause', src:'San Jose Spotlight \u00b7 6h ago', kind:'housing',
        affected:[ ['Downtown lunch trade',37,'up'], ['Coffee shops',29,'up'], ['Housing demand',34,'up'], ['Parking',-22,'down'] ] },
      { title:'VTA light rail closes Alum Rock line for six weeks of track replacement', src:'Mercury News \u00b7 14h ago', kind:'transit',
        affected:[ ['East Side retail',-23,'down'], ['Downtown trade',-8,'down'], ['Rideshare',31,'up'], ['Bus ridership',26,'up'] ] }
    ],
    events: [
      { name:'Sharks vs. Golden Knights', when:'Tonight \u00b7 19:30 \u00b7 SAP Center', attendance:'17,200',
        effects:[ ['San Pedro Square','+88%','up'], ['Downtown dining','+42%','up'], ['Parking','Full by 18:40','down'], ['Rideshare','+21 min','down'], ['Retail','+6%','up'] ] },
      { name:'San Jose Jazz Summer Fest', when:'Fri-Sun \u00b7 Downtown', attendance:'100,000',
        effects:[ ['Downtown bars','+134%','up'], ['Street closures','9 blocks','down'], ['Cafes','+58%','up'], ['Hotels','+37%','up'], ['Japantown dining','+19%','up'] ] }
    ],
    scenarios:[ ['Costco opens on the East Side','bigbox'], ['Back A Yard closes downtown','closure'],
                ['VTA closes the Alum Rock line for six weeks','transit'], ['A 500-unit tower opens in Downtown West','housing'] ],
    insights:[
      'North San Jose has 149k median income and the thinnest walkable retail supply of any high-income district in this atlas.',
      'Alum Rock rent is 70% below Santana Row within six miles, and it is the only district in the county still gaining independents.',
      'Downtown businesses that serve breakfast recovered 2.6x faster from the return-to-office slowdown than dinner-only formats.'
    ]
  },

  /* ===== 14. COLUMBUS, OH ================================================== */
  'columbus': {
    rank: 14, name: 'Columbus', state: 'OH', pop: '933,263', pulse: 83,
    stats: [ ['Economy',80,'up','green'], ['Hiring',84,'up','green'], ['Construction',89,'up','blue'],
             ['Consumer sentiment',72,'up','green'], ['Competition',54,'flat','orange'], ['Commercial rent',46,'up','orange'] ],
    districts: [
      { id:'shortnorth', name:'Short North', x:4, y:2, w:2, h:2, pop:'+3.6%', income:'$91k', rent:'$5.10/sqft', score:71, sat:'high', note:'High Street is the busiest independent corridor in Ohio and now close to fully leased.' },
      { id:'germanvillage', name:'German Village', x:4, y:4, w:2, h:2, pop:'+1.8%', income:'$118k', rent:'$4.40/sqft', score:74, sat:'medium', note:'Historic brick district with affluent, walkable demand and very rare turnover.' },
      { id:'downtowncmh', name:'Downtown', x:3, y:3, w:1, h:2, pop:'+4.4%', income:'$83k', rent:'$3.90/sqft', score:80, sat:'low', note:'Residential conversions are adding evening population to a district that was previously office-only.' },
      { id:'franklinton', name:'Franklinton', x:2, y:2, w:1, h:2, pop:'+6.7%', income:'$52k', rent:'$2.30/sqft', score:92, sat:'very low', note:'East Franklinton arts redevelopment offers the cheapest space within a mile of downtown.' },
      { id:'clintonville', name:'Clintonville', x:4, y:0, w:2, h:2, pop:'+2.3%', income:'$96k', rent:'$3.60/sqft', score:79, sat:'medium', note:'Steady family neighbourhood along North High with the best rent-to-density ratio in the city.' },
      { id:'osuarea', name:'University District', x:2, y:0, w:2, h:2, pop:'+1.9%', income:'$47k', rent:'$4.20/sqft', score:66, sat:'high', note:'65,000 students drive enormous volume nine months a year and a severe summer trough.' },
      { id:'eastonarea', name:'Easton', x:6, y:1, w:3, h:2, pop:'+5.1%', income:'$107k', rent:'$6.30/sqft', score:59, sat:'high', note:'Regional retail destination with national-brand leasing and premium rents.' },
      { id:'lindenarea', name:'Linden', x:6, y:4, w:3, h:2, pop:'+2.7%', income:'$41k', rent:'$1.90/sqft', score:70, sat:'very low', note:'Cleveland Avenue corridor has very thin supply and a large population, with new transit investment planned.' }
    ],
    businesses: [
      { id:'northmarket', name:'North Market', emoji:'\u{1F3EA}', category:'Public market', hood:'Short North', addr:'59 Spruce St',
        rating:4.6, reviews:13400, employees:210, priceTier:'$$', trend:'rising', health:88, closeRisk:6,
        comp:[ ['Budd Dairy Food Hall','newer build|rooftop bar|Italian Village'], ['Easton Town Center','parking|national brands'] ] },
      { id:'schmidts', name:"Schmidt's Sausage Haus", emoji:'\u{1F32D}', category:'German restaurant', hood:'German Village', addr:'240 E Kossuth St',
        rating:4.5, reviews:9800, employees:96, priceTier:'$$', trend:'stable', health:81, closeRisk:10,
        comp:[ ['Katzinger\u2019s Delicatessen','lunch trade|German Village neighbour'], ['Valter\u2019s at the Maennerchor','smaller room|event trade'] ] },
      { id:'foxinsnow', name:'Fox in the Snow Cafe', emoji:'\u{1F950}', category:'Bakery cafe', hood:'Italian Village', addr:'1031 N 4th St',
        rating:4.6, reviews:3900, employees:44, priceTier:'$$', trend:'rising', health:89, closeRisk:5,
        comp:[ ['Mission Coffee','specialty focus|longer hours'], ['Stauf\u2019s Coffee Roasters','multiple sites|wholesale'] ] },
      { id:'ambrose', name:'Ambrose and Eve', emoji:'\u{1F958}', category:'Restaurant', hood:'German Village', addr:'716 S High St',
        rating:4.5, reviews:1400, employees:31, priceTier:'$$', trend:'stable', health:76, closeRisk:15,
        comp:[ ['Lindey\u2019s','longer history|patio|brunch trade'], ['Hey Hey Bar & Grill','cheaper|neighbourhood regulars'] ] },
      { id:'thomasnkeb', name:'Kebab Bites', emoji:'\u{1F959}', category:'Middle Eastern restaurant', hood:'Northland', addr:'2760 Morse Rd',
        rating:4.5, reviews:1100, employees:16, priceTier:'$', trend:'rising', health:83, closeRisk:9,
        comp:[ ['Hoyo\u2019s Kitchen','multiple sites|Somali speciality'], ['Aladdin\u2019s Eatery','chain scale|delivery'] ] },
      { id:'jenisohio', name:"Jeni's Splendid Ice Creams", emoji:'\u{1F366}', category:'Ice cream shop', hood:'Short North', addr:'714 N High St',
        rating:4.6, reviews:4600, employees:39, priceTier:'$$', trend:'declining', health:68, closeRisk:18,
        comp:[ ['Graeter\u2019s','Ohio brand|grocery distribution|cheaper'], ['Simply Rolled','novelty format|younger crowd'] ] }
    ],
    news: [
      { title:'Intel delays Licking County fab to 2030, contractors scale back', src:'Columbus Dispatch \u00b7 3h ago', kind:'closure',
        affected:[ ['New Albany dining',-29,'down'], ['Contractor lunch trade',-34,'down'], ['Housing demand',-18,'down'], ['Hotels',-21,'down'] ] },
      { title:'LinkUS East Main Street bus rapid transit corridor wins federal funding', src:'Axios Columbus \u00b7 1d ago', kind:'transit',
        affected:[ ['Near East Side retail',31,'up'], ['Property values',27,'up'], ['Construction detours',-16,'down'], ['Downtown access',22,'up'] ] }
    ],
    events: [
      { name:'Ohio State vs. Michigan', when:'Saturday \u00b7 12:00 \u00b7 Ohio Stadium', attendance:'105,000',
        effects:[ ['University District bars','+310%','up'], ['Hotels','Sold out','up'], ['Parking','$90 surge','down'], ['Short North dining','+87%','up'], ['Traffic','Gridlock','down'] ] },
      { name:'Ohio State Fair', when:'12 days \u00b7 Ohio Expo Center', attendance:'900,000',
        effects:[ ['Fairgrounds vendors','+280%','up'], ['Clintonville dining','+24%','up'], ['Parking','$25 surge','down'], ['Rideshare','+29 min','down'], ['Retail','+18%','up'] ] }
    ],
    scenarios:[ ['Costco opens in Linden','bigbox'], ["Jeni's closes its Short North flagship",'closure'],
                ['East Main Street closes for BRT construction','transit'], ['A 450-unit conversion opens downtown','housing'] ],
    insights:[
      'Franklinton sits one mile from downtown at 55% lower rent than the Short North, with the fastest population growth in the city.',
      'University District businesses lose 61% of revenue between May and August; those with a delivery channel lose 28%.',
      'Every food hall opened in the metro since 2019 raised nearby independent foot traffic rather than cannibalising it.'
    ]
  },

  /* ===== 15. CHARLOTTE, NC ================================================= */
  'charlotte': {
    rank: 15, name: 'Charlotte', state: 'NC', pop: '943,476', pulse: 87,
    stats: [ ['Economy',86,'up','green'], ['Hiring',83,'up','green'], ['Construction',90,'up','blue'],
             ['Consumer sentiment',73,'up','green'], ['Competition',66,'up','orange'], ['Commercial rent',68,'up','orange'] ],
    districts: [
      { id:'uptowncltw', name:'Uptown', x:4, y:2, w:2, h:2, pop:'+3.2%', income:'$112k', rent:'$6.40/sqft', score:63, sat:'high', note:'Banking-district weekday trade is strong but evenings and weekends remain quiet.' },
      { id:'southend', name:'South End', x:4, y:4, w:2, h:2, pop:'+7.4%', income:'$104k', rent:'$5.80/sqft', score:76, sat:'high', note:'The fastest growing district in the Carolinas along the Blue Line, though rents have nearly doubled.' },
      { id:'noda', name:'NoDa', x:5, y:1, w:2, h:1, pop:'+4.8%', income:'$83k', rent:'$3.70/sqft', score:88, sat:'medium', note:'North Davidson arts district retains independent character at two-thirds of South End rent.' },
      { id:'plazamidwood', name:'Plaza Midwood', x:6, y:2, w:2, h:2, pop:'+3.9%', income:'$97k', rent:'$4.30/sqft', score:82, sat:'medium', note:'Central Avenue supports a dense mix of independents with strong evening and weekend trade.' },
      { id:'dilworth', name:'Dilworth', x:3, y:4, w:1, h:2, pop:'+1.6%', income:'$139k', rent:'$5.20/sqft', score:69, sat:'medium', note:'Established, affluent and walkable around East Boulevard, with rare vacancies.' },
      { id:'universitycityclt', name:'University City', x:6, y:0, w:3, h:1, pop:'+5.3%', income:'$71k', rent:'$3.40/sqft', score:84, sat:'low', note:'UNC Charlotte plus corporate campuses generate steady volume with thin walkable supply.' },
      { id:'westclt', name:'West Charlotte', x:1, y:2, w:3, h:2, pop:'+4.1%', income:'$48k', rent:'$2.10/sqft', score:78, sat:'very low', note:'Beatties Ford Road corridor is the cheapest space in the county, with Gold Line extension planned.' },
      { id:'ballantyne', name:'Ballantyne', x:2, y:5, w:4, h:1, pop:'+4.6%', income:'$142k', rent:'$5.60/sqft', score:73, sat:'medium', note:'Affluent south suburban district being converted from office park to mixed use.' }
    ],
    businesses: [
      { id:'pricesckn', name:"Price's Chicken Coop", emoji:'\u{1F357}', category:'Fried chicken', hood:'South End', addr:'1614 Camden Rd',
        rating:4.6, reviews:3900, employees:21, priceTier:'$', trend:'declining', health:62, closeRisk:28,
        comp:[ ['Bossy Beulah\u2019s','seating|card payment|longer hours'], ['Chick-fil-A','drive-through|scale|consistency'] ] },
      { id:'amelies', name:"Amelie's French Bakery", emoji:'\u{1F950}', category:'Bakery', hood:'NoDa', addr:'2424 N Davidson St',
        rating:4.5, reviews:6200, employees:67, priceTier:'$', trend:'stable', health:79, closeRisk:12,
        comp:[ ['Suarez Bakery','longer history|Park Road catchment'], ['Sunflour Baking Company','multiple sites|savoury range'] ] },
      { id:'kindredclt', name:'Haberdish', emoji:'\u{1F958}', category:'Southern restaurant', hood:'NoDa', addr:'3106 N Davidson St',
        rating:4.5, reviews:4100, employees:58, priceTier:'$$', trend:'rising', health:86, closeRisk:8,
        comp:[ ['Reigning Doughnuts','daytime format|lower labour'], ['Supperland','event dining|higher ticket|larger room'] ] },
      { id:'notjustcoffee', name:'Not Just Coffee', emoji:'\u2615', category:'Coffee shop', hood:'Uptown', addr:'224 E 7th St',
        rating:4.5, reviews:2700, employees:34, priceTier:'$$', trend:'stable', health:77, closeRisk:14,
        comp:[ ['Undercurrent Coffee','Plaza Midwood catchment|later hours'], ['Summit Coffee','multiple sites|food menu'] ] },
      { id:'seoulfood', name:'Seoul Food Meat Company', emoji:'\u{1F969}', category:'Korean barbecue', hood:'South End', addr:'1400 S Church St',
        rating:4.4, reviews:3300, employees:52, priceTier:'$$', trend:'declining', health:65, closeRisk:21,
        comp:[ ['Futo Buta','ramen niche|South End neighbour|cheaper'], ['O-Ku','higher ticket|rooftop|sushi programme'] ] },
      { id:'7thstmarket', name:'7th Street Public Market', emoji:'\u{1F3EA}', category:'Public market', hood:'Uptown', addr:'224 E 7th St',
        rating:4.4, reviews:5400, employees:88, priceTier:'$$', trend:'stable', health:74, closeRisk:16,
        comp:[ ['Optimist Hall','larger format|free parking|NoDa adjacency'], ['Camp North End','event programming|outdoor space'] ] }
    ],
    news: [
      { title:'Bank of America and Truist add 3,000 Uptown roles as return-to-office tightens', src:'Charlotte Observer \u00b7 4h ago', kind:'housing',
        affected:[ ['Uptown lunch trade',44,'up'], ['Coffee shops',36,'up'], ['Parking',-23,'down'], ['South End housing',28,'up'] ] },
      { title:'Silver Line light rail alignment approved through West Charlotte', src:'WFAE \u00b7 1d ago', kind:'transit',
        affected:[ ['West Charlotte property',39,'up'], ['Beatties Ford retail',31,'up'], ['Construction detours',-19,'down'], ['Bus ridership',17,'up'] ] }
    ],
    events: [
      { name:'Panthers vs. Falcons', when:'Sunday \u00b7 13:00 \u00b7 Bank of America Stadium', attendance:'74,500',
        effects:[ ['Uptown bars','+178%','up'], ['Parking','$60 surge','down'], ['South End dining','+44%','up'], ['Blue Line crowding','Severe','down'], ['Hotels','+49%','up'] ] },
      { name:'Coca-Cola 600', when:'Sunday \u00b7 18:00 \u00b7 Charlotte Motor Speedway', attendance:'95,000',
        effects:[ ['Concord hotels','Sold out','up'], ['Uptown dining','+27%','up'], ['I-85 traffic','Gridlock','down'], ['Retail','+33%','up'], ['Rideshare','+41 min','down'] ] }
    ],
    scenarios:[ ['Costco opens in West Charlotte','bigbox'], ["Price's Chicken Coop closes in South End",'closure'],
                ['The Blue Line closes for six weeks of track work','transit'], ['A 600-unit tower opens in South End','housing'] ],
    insights:[
      'NoDa carries 84% of South End\u2019s weekend foot traffic at 64% of the rent - the widest value gap in the Carolinas.',
      'Every business within 400m of a Blue Line station gained foot traffic after the last service increase; those two blocks away did not.',
      'South End independents that opened before 2020 have a 71% survival rate; those that opened after the rent doubled sit at 38%.'
    ]
  }

});
