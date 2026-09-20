export type Vehicle = { id:string; name:string; price:number; year:number; mileage:string; transmission:string; fuel:string; location:string; seller:string; verified:boolean; condition:string; image:number; status?:string };
export type DirectoryItem = { id:string; name:string; type:string; location:string; rating:number; reviews:number; verified:boolean; image:number; detail:string; price?:string; tags:string[] };
export type Part = { id:string; name:string; category:string; condition:string; price:number; location:string; seller:string; image:number };

export const vehicles: Vehicle[] = [
 {id:'toyota-harrier-2020',name:'Toyota Harrier Premium',price:485000,year:2020,mileage:'48,200 km',transmission:'Automatic',fuel:'Petrol',location:'Lusaka',seller:'Autoworld Zambia',verified:true,condition:'Used – excellent',image:0,status:'Active'},
 {id:'isuzu-dmax-2021',name:'Isuzu D-Max Double Cab',price:625000,year:2021,mileage:'63,100 km',transmission:'Automatic',fuel:'Diesel',location:'Ndola',seller:'Copperbelt Motors',verified:true,condition:'Used – good',image:1,status:'Active'},
 {id:'toyota-vitz-2019',name:'Toyota Vitz',price:198000,year:2019,mileage:'72,600 km',transmission:'Automatic',fuel:'Petrol',location:'Kitwe',seller:'Mwamba J.',verified:false,condition:'Used – good',image:2,status:'Pending'},
 {id:'honda-grace-2018',name:'Honda Grace Hybrid',price:245000,year:2018,mileage:'59,400 km',transmission:'Automatic',fuel:'Hybrid',location:'Lusaka',seller:'Prime Auto Imports',verified:true,condition:'Imported – unregistered',image:3,status:'Draft'},
];

export const services: DirectoryItem[] = [
 {id:'precision-auto',name:'Precision Auto Care',type:'Mechanic',location:'Woodlands, Lusaka',rating:4.9,reviews:128,verified:true,image:0,detail:'Diagnostics, engine repair and scheduled maintenance',price:'From K250',tags:['Open today','Mobile service']},
 {id:'copperbelt-service',name:'Copperbelt Service Centre',type:'Servicing company',location:'Industrial Area, Ndola',rating:4.8,reviews:96,verified:true,image:1,detail:'Full vehicle servicing, brakes and suspension',price:'From K450',tags:['Mon–Sat','Warranty']},
 {id:'lusaka-auto-electrics',name:'Lusaka Auto Electrics',type:'Mechanic',location:'Chilenje, Lusaka',rating:4.7,reviews:74,verified:false,image:0,detail:'Electrical diagnostics, batteries and air conditioning',price:'From K200',tags:['Available today']},
];

export const agents: DirectoryItem[] = [
 {id:'zambezi-imports',name:'Zambezi Auto Imports',type:'Import agent',location:'Lusaka',rating:4.9,reviews:84,verified:true,image:3,detail:'End-to-end vehicle sourcing, shipping and clearance',price:'Quote in 24 hours',tags:['Japan → Zambia','Durban → Zambia']},
 {id:'gateway-logistics',name:'Gateway Vehicle Logistics',type:'Import agent',location:'Ndola',rating:4.7,reviews:51,verified:true,image:3,detail:'Port collection, customs support and inland delivery',price:'From K18,500',tags:['Dar es Salaam → Zambia','Durban → Zambia']},
];

export const parts: Part[] = [
 {id:'brake-kit',name:'Front brake disc & pad kit',category:'Brakes',condition:'New',price:2850,location:'Lusaka',seller:'MotorHub Parts',image:2},
 {id:'shock-absorbers',name:'Heavy-duty shock absorbers',category:'Suspension',condition:'New',price:4200,location:'Ndola',seller:'Copperbelt Spares',image:2},
 {id:'headlamp',name:'LED headlamp assembly',category:'Lighting',condition:'Used – tested',price:1750,location:'Kitwe',seller:'JDM Parts Zambia',image:2},
 {id:'alternator',name:'Reconditioned alternator',category:'Electrical',condition:'Reconditioned',price:2300,location:'Lusaka',seller:'Auto Electric Centre',image:2},
];

export const reviews = [
 {name:'Natasha M.',rating:5,date:'12 Sep 2026',text:'Clear communication and the vehicle was exactly as described.'},
 {name:'Chanda K.',rating:5,date:'4 Sep 2026',text:'Professional service, fair pricing and quick turnaround.'},
 {name:'Brian S.',rating:4,date:'28 Aug 2026',text:'Helpful throughout the process and easy to reach.'},
];

export const notifications = [
 {title:'Price drop on a saved vehicle',body:'Toyota Harrier Premium is now K485,000.',time:'12 min ago',unread:true},
 {title:'New reply from Precision Auto Care',body:'Your service request has received a response.',time:'2 hours ago',unread:true},
 {title:'Verification update',body:'Your submitted documents are being reviewed.',time:'Yesterday',unread:false},
];

export const messages = [
 {name:'Autoworld Zambia',subject:'Toyota Harrier Premium',preview:'Yes, the vehicle is still available for viewing.',time:'10:42',unread:true},
 {name:'Precision Auto Care',subject:'Service request',preview:'We can inspect the vehicle on Thursday morning.',time:'Yesterday',unread:false},
 {name:'Zambezi Auto Imports',subject:'Japan import quote',preview:'Your estimated quotation is ready to review.',time:'Mon',unread:false},
];

export const roles = [
 {id:'buyer',label:'Buyer',description:'Find, compare and save vehicles'},
 {id:'private-seller',label:'Private seller',description:'Sell your personal vehicle'},
 {id:'dealer',label:'Dealer',description:'Manage dealership inventory'},
 {id:'mechanic',label:'Mechanic',description:'Offer repairs and consultations'},
 {id:'servicing-company',label:'Servicing company',description:'Manage services and requests'},
 {id:'parts-seller',label:'Parts seller',description:'List and manage automotive parts'},
 {id:'import-agent',label:'Import agent',description:'Publish routes and import services'},
] as const;

export const adminSections = ['Users','Dealers','Private sellers','Mechanics','Servicing companies','Parts sellers','Import agents','Vehicles','Verification requests','Reports','Reviews','Information content'];
