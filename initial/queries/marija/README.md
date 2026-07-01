# Upiti


## Upit 1

Tekst upita: Proizvodi sa laznim marketingom - Pronalaženje proizvoda koji imaju ogroman hajp na sajtu
(loves_count u vrhu), ali su u recenzijama dobili katastrofalne ocene od stvarnih kupaca (prosek
ocena u recenzijama manji ili jednak 3.5). Može i obrnuto, mali broj lajkova, ali visoke recenzije.

Kod upita: 
``` 
db.reviews.aggregate([
  {
    $group: {
      _id: "$product_id",
      avgReviewRating: { $avg: "$rating" },
      reviewCount: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: "product_info",
      localField: "_id",
      foreignField: "product_id",
      as: "product"
    }
  },
  { $unwind: "$product" },
  {
    $addFields: {
      lovesCount: "$product.loves_count",
      productName: "$product.product_name",
      brand: "$product.brand_name"
    }
  },
  {
    $facet: {
      allData: [{ $match: {} }],
      stats: [
        { $group: { _id: null, avgLoves: { $avg: "$lovesCount" } } }
      ]
    }
  },
  { $unwind: "$stats" },
  { $unwind: "$allData" },
  {
    $project: {
      productName: "$allData.productName",
      brand: "$allData.brand",
      lovesCount: "$allData.lovesCount",
      avgReviewRating: "$allData.avgReviewRating",
      reviewCount: "$allData.reviewCount",
      isFakeHype: {
        $and: [
          { $gt: ["$allData.lovesCount", "$stats.avgLoves"] },
          { $lte: ["$allData.avgReviewRating", 3.5] }
        ]
      },
      isHiddenGem: {
        $and: [
          { $lt: ["$allData.lovesCount", "$stats.avgLoves"] },
          { $gte: ["$allData.avgReviewRating", 4.5] }
        ]
      }
    }
  },
  { $match: { $or: [{ isFakeHype: true }, { isHiddenGem: true }] } },
  { $sort: { lovesCount: -1 } }
], { allowDiskUse: true });
```

Rezultat upita: slika1.1

Performanse:
- Vreme trajanja upita: 41s
- Uocavanje uskih grla
- Prikaz explain naredbe - slika1.2



## Upit 2

Tekst upita: Najbolje kreme za specifičan tip kože - Data Scientist pravi algoritam za preporuke. Koji
brendovi imaju najbolji rejting isključivo među korisnicima koji imaju skin_type: 'Oily' i skin_tone:
'Light'?

Kod upita: 
``` 
db.reviews.aggregate([
  {
    $lookup: {
      from: "product_info",
      localField: "product_id",
      foreignField: "product_id",
      as: "productData"
    }
  },
  { $unwind: "$productData" },
  { $addFields: { brand_name: "$productData.brand_name" } },
  {
    $match: {
      skin_type: "oily",
      skin_tone: "light"
    }
  },
  {
    $group: {
      _id: "$brand_name",
      allRatings: { $push: "$rating" },
      totalReviews: { $sum: 1 }
    }
  },
  {
    $project: {
      brand: "$_id",
      totalReviews: 1,
      recomputedAvg: { $avg: "$allRatings" }
    }
  },
  { $sort: { recomputedAvg: -1 } }
], { allowDiskUse: true });
```

Rezultat upita: slika2.1

Performanse:
- Vreme trajanja upita: 3min 18s
- Uocavanje uskih grla
- Prikaz explain naredbe - slika2.2


## Upit 3: 

Tekst upita: Kritičari od poverenja - Želimo da izolujemo autore čije recenzije zajednica smatra izuzetno
korisnim (helpfulness), a koji pišu detaljne opise (duže od 300 karaktera) i ne daju olako ocene 5.
Za svakog izdvojenog autora računamo "relativni rang korisnosti" odnosno koliko je njegova specifično recenzija korisnija
u poređenju sa prosekom svih ostalih recenzija istog proizvoda. Na taj način identifikujemo autore koji značajno nadmašuju
ostale recezente.

Kod upita: 
``` 
db.reviews.aggregate([
  {
    $addFields: {
      reviewLength: { $strLenCP: { $ifNull: ["$review_text", ""] } }
    }
  },
  {
    $match: {
      $expr: {
        $and: [
          { $gt: ["$reviewLength", 300] },
          { $ne: ["$rating", 5] },
          { $gt: ["$helpfulness", 0] }
        ]
      }
    }
  },
  { $limit: 100 },   
  {
    $lookup: {
      from: "reviews",
      let: { pid: "$product_id", myAuthor: "$author_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$product_id", "$$pid"] } } }
      ],
      as: "sameProductReviews"
    }
  },
  {
    $addFields: {
      productAvgHelpfulness: { $avg: "$sameProductReviews.helpfulness" },
      relativeHelpfulness: {
        $subtract: [
          { $ifNull: ["$helpfulness", 0] },
          { $avg: "$sameProductReviews.helpfulness" }
        ]
      }
    }
  },
  {
    $group: {
      _id: "$author_id",
      avgHelpfulness: { $avg: "$helpfulness" },
      avgRelativeHelpfulness: { $avg: "$relativeHelpfulness" },
      totalReviews: { $sum: 1 }
    }
  },
  { $sort: { avgRelativeHelpfulness: -1 } }
], { allowDiskUse: true });
```
Rezultat upita: slika3.1

Performanse:
- Vreme trajanja upita:  [ (3min i 40s) x ________  ] s                --- 3min i 40s potrebno za limit od 100 dokumenata
- Uocavanje uskih grla
- Prikaz explain naredbe - slika3.2


## Upit 4:

Tekst upita: Detekcija anomalija preporuka - Tražimo recenzije gde je korisnik dao dobre ocene, 4 ili 5, a
polje is_recommended je označeno sa false (ne preporučuje proizvod). Želimo da vidimo koji proizvodi imaju
najviše ovakvih zbunjujućih recenzija. 

Kod upita: 
``` 
db.reviews.aggregate([
  {
    $addFields: {
      isConfusing: {
        $and: [
          { $in: ["$rating", [4, 5]] },
          { $eq: ["$is_recommended", false] }
        ]
      }
    }
  },
  { $match: { isConfusing: true } },
  {
    $group: {
      _id: "$product_id",
      confusingCount: { $sum: 1 },
      examples: { $push: "$review_text" }
    }
  },
  {
    $lookup: {
      from: "product_info",
      localField: "_id",
      foreignField: "product_id",
      as: "product"
    }
  },
  { $unwind: "$product" },
  {
    $project: {
      productName: "$product.product_name",
      brand: "$product.brand_name",
      confusingCount: 1
    }
  },
  { $sort: { confusingCount: -1 } }
], { allowDiskUse: true });
```

Rezultat upita: slika4.1

Performanse:
- Vreme trajanja upita: 1min 1s
- Uocavanje uskih grla
- Prikaz explain naredbe - slika4.2


## Upit 5: 

Tekst upita: Collaborative Filtering - Želimo da grupišemo recenzije prema potpunom profilu autora
(skin_type + skin_tone + eye_color) i da izračunamo koji proizvodi imaju stopu preporuka
(is_recommended) preko 90% unutar tog specifičnog mikrotipa.

Kod upita: 
``` 

```

Rezultat upita: slika5.1

Performanse:
- Vreme trajanja upita: s
- Uocavanje uskih grla
- Prikaz explain naredbe - slika5.2
