// Upit 1 




// Upit 2




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