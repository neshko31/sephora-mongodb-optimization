// Upit 1    
db.reviews.aggregate([
  {                                                                                 
    $group: {                                                               //prvo se vrsi agregacija po proizvodu
      _id: "$product_id",                                                   //za vsaki p se racuna prosecna ocena i br recenzija
      avgReviewRating: { $avg: "$rating" },
      reviewCount: { $sum: 1 }
    }
  },
  {                                                                         
    $lookup: {                                                              //sppajanje sa tabelom product_info
      from: "product_info",
      localField: "_id",
      foreignField: "product_id",
      as: "product"
    }
  },
  { $unwind: "$product" },                                                              
  {
    $addFields: {                                                           //svakom dokumentu se dodaju sl polja
      lovesCount: "$product.loves_count",
      productName: "$product.product_name",
      brand: "$product.brand_name"
    }
  },
  {                                                                         
    $facet: {                                                               //memorijski destruktivan operator -> omogucava izvrsavanje vise paralelnih pipelinova
      allData: [{ $match: {} }],                                            //u allData cuvam sve do sada obradjene proizvode
      stats: [                                                              //u stats trpam sve prethodne proizvode, stavljam u jednu veliku grupu i za nju racunam prosek ;ovesCount za CITAV sajt!
        { $group: { _id: null, avgLoves: { $avg: "$lovesCount" } } }
      ]
    }
  },
  { $unwind: "$stats" },                                                    //raspakivanje
  { $unwind: "$allData" },
  {
    $project: {                                                             //oblikuje konacni izlaz 
      productName: "$allData.productName",
      brand: "$allData.brand",
      lovesCount: "$allData.lovesCount",
      avgReviewRating: "$allData.avgReviewRating",
      reviewCount: "$allData.reviewCount",
      isFakeHype: {
        $and: [
          { $gt: ["$allData.lovesCount", "$stats.avgLoves"] },              //fejk hajp ako proizvpd ima vise lajkova nego sto sajt ima prosecno po proizvodu
          { $lte: ["$allData.avgReviewRating", 3.5] }                       //a nekako je opet ocena jako niska tj ispod 3.5
        ]
      },
      isHiddenGem: {                                                        //hiden dzem ako ima manje lajkova nego prosecan proizvod
        $and: [                                                             //ali ima jako visoku ocenu
          { $lt: ["$allData.lovesCount", "$stats.avgLoves"] },
          { $gte: ["$allData.avgReviewRating", 4.5] }
        ]
      }
    }
  },
{ $match: { $or: [{ isFakeHype: true }, { isHiddenGem: true }] } },       //filtriram samo da dobijem ili jedno ili drugo, ostalo me ne interesuje !
{ $sort: { lovesCount: -1 } }
], { allowDiskUse: true });



// Upit 2
db.reviews.aggregate([
  {
    $lookup: {                                                            //odmah spajanje tablea
      from: "product_info",
      localField: "product_id",
      foreignField: "product_id",
      as: "productData"
    }
  },
  { $unwind: "$productData" },
  { $addFields: { brand_name: "$productData.brand_name" } },
  {
    $match: {                                                             //filtriram samoone proizvode namenje za specificne tipove koze
      skin_type: "oily",
      skin_tone: "light"
    }
  },
  {                                                                       //grupisem ih po nayvi brenda
    $group: {
      _id: "$brand_name",       
      allRatings: { $push: "$rating" },                                   //sve ocene trpa u jedan masivan niz u memoriji baze
      totalReviews: { $sum: 1 }                                           //broji br rec  
    }
  },
  {
    $project: {                                                          //racuna prosek i daj eprojekciju
      brand: "$_id",
      totalReviews: 1,
      recomputedAvg: { $avg: "$allRatings" }
    }
  },
  { $sort: { recomputedAvg: -1 } }
], { allowDiskUse: true });



// Upit 3 
db.reviews.aggregate([
  {
    //racunanje duzine recenzija
    $addFields: {                                                           //svakom dokumentu se dodaje novo polje
      reviewLength: { $strLenCP: { $ifNull: ["$review_text", ""] } }        //racuna duzinu recenzije -> strLenCp broji broj unicode karaktera (Code Points). Koristim CP verziju jer recenzije mogu imati spec karaktere !
    }                                                                       //ako je recenzija prazna, racuna duzinu praznog stringa -> dodato da ne baca gresku !
  },                                                                        //namerno racunam duzinu rec za svaki dokument kako bih ubila performanse
  {
    //filtriranje po uslovima
    $match: {                                                               
      $expr: {                                                              //expr omogucava koriscenje agr operatora (gt, lt, ne) unutar match-a -> trebalo bi da brani MongoDB-u koriscenje standardnih indeksa
        $and: [                                                             //moraju da vaze sva tri uslova
          { $gt: ["$reviewLength", 300] },
          { $ne: ["$rating", 5] },
          { $gt: ["$helpfulness", 0] }
        ]
      }
    }
  },
  { $limit: 100 },                                                          //ogranicava broj dokumenata pre skupog self-lookup-a -> ovo sam morala da dodam jer bi inace cekala satima da se izvrsi
  {
    //povlacenje svih recenzija istog proizvoda
    $lookup: {                                                              //koristi se za spajanje kolekcija
      from: "reviews",                                                      //spaja samu sebe sa sobom
      let: { pid: "$product_id", myAuthor: "$author_id" },                  //definisem promenljive koje cu koristiti u pod-pipeline-u
      pipeline: [
        { $match: { $expr: { $eq: ["$product_id", "$$pid"] } } }            //$product_id je iz unutrasnje kolekcije recenzija, dok je $$pid iz spoljasnje
      ],                                                                    //pronalazi sve recenzije koje imaju isti product_id kao trenutna recenzija
      as: "sameProductReviews"
    }
  },
  {
    //racunanje relativne korisnosti
    $addFields: {
      productAvgHelpfulness: { $avg: "$sameProductReviews.helpfulness" },   //racuna prosecnu korisnost svih receenzija tog proizvoda
      relativeHelpfulness: {
        $subtract: [                                                        //oduzimamo prosek proizvoda od korisnosti trenutne recenzije
          { $ifNull: ["$helpfulness", 0] },
          { $avg: "$sameProductReviews.helpfulness" }
        ]
      }
    }
  },
  {
    //grupisanje po autoru
    $group: {
      _id: "$author_id",
      avgHelpfulness: { $avg: "$helpfulness" },
      avgRelativeHelpfulness: { $avg: "$relativeHelpfulness" },             //prosek "relativne" korisnosti
      totalReviews: { $sum: 1 }                                             //broji koliko recenzija (koje ispunjavaju uslove) je autor napisao
    }   
  },
  { $sort: { avgRelativeHelpfulness: -1 } }
], { allowDiskUse: true });                                                 //omogucava pisanje privremenih datoteka na disk ako dodje do prekoracenja te neke ugradjene memorije





// Upit 4
db.reviews.aggregate([
  {                                                                         //super poceti sa ovim jer se racuna isConfusing za milion dokumenata 
    $addFields: {                                                           //svakom dokumentu dodajem novo polje koje moze biti true/false
      isConfusing: {
        $and: [
          { $in: ["$rating", [4, 5]] },
          { $eq: ["$is_recommended", false] }
        ]
      }
    }
  },                                                                        //izdvajam samo one recenzije koji jesu anomalija
  { $match: { isConfusing: true } },
  {                                                                         //grupisem dokumente po proizvodu 
    $group: {
      _id: "$product_id",                                                   //id obavezno polje u fazi $group
      confusingCount: { $sum: 1 },                                          //za svaki racunam koliko je imao konfuznih recenzijaa
      examples: { $push: "$review_text" }                                   //$push uzima tekst recenzije iz svakog dokumenta i ubacuje ga u niz
    }                                                                       //na kraju ove faze, za svaki proizvod imamo listu svih tekstova koji su zbunjujući
  },
  {
    $lookup: {                                                              //pobezivanje sa podacima o proizvodu
      from: "product_info",
      localField: "_id",
      foreignField: "product_id",
      as: "product"
    }
  },
  { $unwind: "$product" },                                                  //raspakuje niz unutar nekog dokumenta -> znaci kada dokument ima niz elemenata, on ce kreirati kopiju tog dokumenta za svaki pojedinacni elemetn tog niza 
  {
    $project: {                                                             //izbor izlaznih polja
      productName: "$product.product_name",
      brand: "$product.brand_name",
      confusingCount: 1
    }
  },
  { $sort: { confusingCount: -1 } }
], { allowDiskUse: true });





// Upit 5 
db.getCollection("reviews").aggregate([
  {
    $match: {                                                               //uzimam samo dokumente ciji tekstovi sadrze neku od ispod pomenutih sintagmi
      "review_text": {  
        $regex: /free sample|gifted by|incentivized|complimentary|voxbox/i  // "/" oznacava pocetak i kraj reguarnog izraza, dok "i" na kraju znači da je case insensitive
      },
      "is_recommended": { $exists: true }                                   //proverava da l postoji polje
    }
  },
  {
    $group: {                                                               //agregacija metrika po proizvodu
      "_id": "$product_id",
      "broj_sponzorisanih_recenzija": { $sum: 1 },
      "prosecna_ocena_sponzorisanih": { $avg: "$rating" }
    }
  },
  {
    $match: {
      "broj_sponzorisanih_recenzija": { $gte: 5 }                           //uzimam samo one koji imaju vise od 5 sponzorisanih rec
    }
  },
  {
    $lookup: {                                                              //povezujem tabele kako bih dob osnovne podatke o proizvodu
      from: "product_info",
      localField: "_id",
      foreignField: "product_id",
      as: "detalji_proizvoda"
    }
  },
  {
    $unwind: "$detalji_proizvoda"                               
  },
  {
    $addFields: {                                                           //od opste ocenene oduzimamo vestacku ocenu
      "indeks_pristrasnosti": {                                             //sto je razlika veca to je marketing vise izvestacio ocenu ovog proizvoda
        $subtract: ["$prosecna_ocena_sponzorisanih", "$detalji_proizvoda.rating"] 
      }
    }
  },
  {
    $match: {
      "indeks_pristrasnosti": { $gt: 0 }                                    //uzimam samo one proizvode gde je primecena ona pristrasnost
    }   
  },
  {
    $sort: { "indeks_pristrasnosti": -1 }
  },
  {
    $project: {
      "_id": 0,
      "product_name": "$detalji_proizvoda.product_name",
      "brand_name": "$detalji_proizvoda.brand_name",
      "organic_site_rating": "$detalji_proizvoda.rating",
      "sponsored_reviews_count": "$broj_sponzorisanih_recenzija",
      "sponsored_avg_rating": { $round: ["$prosecna_ocena_sponzorisanih", 2] },
      "bias_score": { $round: ["$indeks_pristrasnosti", 2] }
    }
  }
], { allowDiskUse: true });
