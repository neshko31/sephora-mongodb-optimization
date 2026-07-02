# Upiti

## Korisne naredbe
``` 
// Korisne naredbe!
// Za pokretanje dobavljanja informacija o izvršavanju: db.<collection_name>.explain("executionStats").aggregate([...]);
// Za brisanje keširanih upita: db.<collection_name>.getPlanCache().clear()
``` 

## Upit 1

### Tekst upita: 
Analiza hajpa i tagova - Da li proizvodi koji imaju tag 'Vegan' ili ‘Clean + Planet Positive’ u polju highlights imaju značajno višu prosečnu cenu i veći broj lajkova (loves_count) u odnosu na standardne proizvode i da li se oni češće preporučuju?

### Kod upita: 
``` 
db.getCollection("product_info").aggregate([
    {
        // Faza 1: kreiranje novih polja u odnosu na vrednosti polja highlights
        $addFields: {
            "is_vegan": { $in: ["Vegan", "$highlights"] },
            "is_clean_positive": { $in: ["Clean + Planet Positive", "$highlights"] }
        }
    },
    {
        // Faza 2: kreiranje polja koje ce se koristiti za grupisanje kasnije
        $addFields: {
            "product_highlight": {
                $switch: {
                    branches: [
                        { case: { $and: [{ $eq: ["$is_vegan", true] }, { $eq: ["$is_clean_positive", true] }] }, then: "Both" },
                        { case: { $eq: ["$is_vegan", true] }, then: "Vegan" },
                        { case: { $eq: ["$is_clean_positive", true] }, then: "Clean + Planet Positive" }
                    ],
                    default: "Standard"
                }
            }
        }
    },
    {
        // Dodatna faza: uradjeno dodatno samo kako bi se moglo zapravo izvrsiti, u optimizovanoj verziji
        $limit: 500
    },
    {
        // Faza 3: spajanje sa tabelom recenzija
        $lookup: {
            from: "reviews",
            localField: "product_id",
            foreignField: "product_id",
            as: "product_reviews",
            pipeline: [
                {
                    $group: {
                        "_id": null,
                        "broj_recenzija_proizvoda": { $sum: 1 },
                        "broj_preporuka_proizvoda": { $sum: { $cond: ["$is_recommended", 1, 0] } }
                    }
                }
            ]
        }
    },
    {
        // Faza 4: izdvajanje proizvoda koji imaju recenzije
        $match: {
            $expr: { $gt: [{ $size: "$product_reviews"}, 0]}
        }
    },
    {
        // Faza 5: grupisanje po dobijenim highlights
        $group: {
            "_id": "$product_highlight",
            "broj_proizvoda": { $sum: 1 },
            "prosecna_cena_usd": { $avg: "$price_usd" },
            "prosecan_loves_count": { $avg: "$loves_count" },
            "prosecan_rating": { $avg: "$rating" },
            "ukupno_recenzija": { $sum: { $sum: "$product_reviews.broj_recenzija_proizvoda" } },
            "broj_preporuka": { $sum: { $sum: "$product_reviews.broj_preporuka_proizvoda" } }
        }
    },
    {
        // Faza 6: Sortiranje
        $sort: { "prosecna_cena_usd": -1 }
    },
    {
        // Faza 7: ispis rezultata
        $project: {
            "_id": 0,
            "product_highlight": "$_id",
            "broj_proizvoda": 1,
            "prosecna_cena_usd": 1,
            "prosecan_loves_count": 1,
            "prosecan_rating": 1,
            "ukupno_recenzija": 1,
            "broj_preporuka": 1
        }
    }
],
    { allowDiskUse: true });
```

### Rezultat upita: 

![alt text](query1-results.png)

### Performanse:
Vreme trajanja upita: 14:23.495
- Napomena: Ovakav kod koji je dostupan, sadrži i dodatnu *$limit: 500* etapu koja će biti obrisana kad se bude radilo nad optimizovanom verzijom. Ta etapa je dodata iz razloga što je trajanje upita bez nje prešlo trajanje od 5 sati, ali se upit još uvek nije izvršio i tad je izvršavanje prekinuto!

Uočavanje uskih grla:

![alt text](query1-explain.png)
- Uočena su uska grla..

## Upit 2: 

### Tekst upita:
Detekcija "Štetnih" sastojaka kroz kategorije - U kojim se kategorijama (primarna/sekundarna) proizvoda najčešće pojavljuju neželjeni sastojci (npr. 'Alcohol', 'Paraben', 'Sulfate') i prikazati prosečnu cenu proizvoda i prosečan rating proizvoda iz tih kategorija, uz prikaz raspodele ocena. 

### Kod upita: 
``` 
db.getCollection("product_info").aggregate([
    {
        // Faza 1: razmotavanje niza sastojaka zbog regex pretrage po elementima
        $unwind: "$ingredients"
    },
    {
        // Faza 2: pronalazak proizvoda sa štetnim sastojcima
        // Lista za match dobijena ovde: https://www.ewg.org/the-toxic-twelve-chemicals-and-contaminants-in-cosmetics
        // Dodatno je pretrazeno i Sulfate
        $match: {
            $or: [
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Formaldehyde", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Paraformaldehyde", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Methylene glycol", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Quaternium 15", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Mercury", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Phthalate", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Paraben", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "phenylenediamine", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "PFA", options: "i" } } },
                { $expr: { $regexMatch: { input: "$ingredients", regex: "Sulfate", options: "i" } } }
            ]
        }
    },
    {
        // Faza 3: grupisanje po proizvodu da uklonimo duplikate ako proizvod ima više štetnih sastojaka
        $group: {
            _id: "$_id",
            product_id: { $first: "$product_id" },
            product_name: { $first: "$product_name" },
            rating: { $first: "$rating" },
            price_usd: { $first: "$price_usd" },
            primary_category: { $first: "$primary_category" },
            secondary_category: { $first: "$secondary_category" },
            tertiary_category: { $first: "$tertiary_category" }
        }
    },
    {
        // Faza 4: spajanje proizvoda sa njihovim recenzijama kako bismo videli raspodelu ocena
        $lookup: {
            from: "reviews",
            localField: "product_id",
            foreignField: "product_id",
            as: "raw_reviews"
        }
    },
    {
        // Faza 5: razmotavanje niza recenzija kako bismo ih mogli ispravno prebrojati
        $unwind: "$raw_reviews"
    },
    {
        // Faza 6: prvo grupisanje po proizvodu i brojanje ocena
        $group: {
            _id: {
                product_id: "$product_id"
            },
            primary: { $first: "$primary_category" },
            secondary: { $first: "$secondary_category" },
            product_static_rating: { $first: "$rating" },
            product_price_usd: { $first: "$price_usd" },
            total_reviews_count: { $sum: 1 },
            stars_1: { $sum: { $cond: [{ $eq: ["$raw_reviews.rating", 1] }, 1, 0] } },
            stars_2: { $sum: { $cond: [{ $eq: ["$raw_reviews.rating", 2] }, 1, 0] } },
            stars_3: { $sum: { $cond: [{ $eq: ["$raw_reviews.rating", 3] }, 1, 0] } },
            stars_4: { $sum: { $cond: [{ $eq: ["$raw_reviews.rating", 4] }, 1, 0] } },
            stars_5: { $sum: { $cond: [{ $eq: ["$raw_reviews.rating", 5] }, 1, 0] } }
        }
    },
    {
        // Faza 7: drugo grupisanje po kategorijama (primarna i sekundarna) i brojanje ocena
        $group: {
            _id: {
                primary: "$primary",
                secondary: "$secondary"
            },
            number_of_harmful_products: { $sum: 1 },
            avg_product_rating: { $avg: "$product_static_rating" },
            avg_product_price_usd: { $avg: "$product_price_usd" },
            total_reviews_count: { $sum: 1 },
            total_stars_1: { $sum: "$stars_1" },
            total_stars_2: { $sum: "$stars_2" },
            total_stars_3: { $sum: "$stars_3" },
            total_stars_4: { $sum: "$stars_4" },
            total_stars_5: { $sum: "$stars_5" },
        }
    },
    {
        // Faza 8: projektovanje konacnog dokumenta
        $project: {
            _id: 0,
            category_hierarchy: "$_id",
            number_of_harmful_products: 1,
            avg_product_rating: 1,
            avg_product_price_usd: 1,
            total_reviews_count: 1,
            reviews_rating_distribution: {
                "1_star": "$total_stars_1",
                "2_star": "$total_stars_2",
                "3_star": "$total_stars_3",
                "4_star": "$total_stars_4",
                "5_star": "$total_stars_5"
            }
        }
    },
    {
        // Faza 9: opadajuce sortiranje, kategorije sa najvise stetnih proizvoda izbijaju na vrh
        $sort: { count: -1 }
    }
],
    { allowDiskUse: true });
```

### Rezultat upita: 

![alt text](query2-results.png)

### Performanse:
Vreme trajanja upita: 14:03.262

Uočavanje uskih grla:

![alt text](query2-explain.png)
- Uočena su uska grla..

## Upit 3 

### Tekst upita: 
Analiza menjanja mišljenja - Kako se kretala prosečna ocena po godinama od prve recenzije za 20 najpopularnijih proizvoda koji pripadaju ‘Skincare’ primarnoj kategoriji po broju recenzija, s tim da se posmatraju samo proizvodi koji sigurno imaju recenzije?

### Kod upita: 
``` 
db.getCollection("product_info").aggregate([
    {
        // Faza 1: izdvajanje samo Skincare proizvoda iz razloga sto su recenzije u skupu samo za njih vezane
        $match: { "primary_category": "Skincare" }
    },
    {
        // Faza 2: spajanje sa reviews kolekcijom kako bi se moglo pratiti kroz vreme
        $lookup: {
            from: "reviews",
            localField: "product_id",
            foreignField: "product_id",
            as: "product_reviews",
            pipeline: [
                {
                    $project: {
                        "_id": 1,
                        "rating_review": "$rating",
                        "review_year": { $year: "$submission_time" }
                    }
                }
            ]
        }
    },
    {
        // Faza 3: garantovanje da sami vec izvuceni proizvodi imaju recenzije
        $match: {
            $expr: { $gt: [{ $size: "$product_reviews" }, 0] }
        }
    },
    {
        // Faza 4: racunanje stvarnog broja reviews
        $addFields: {
            "reviews_count": { $size: "$product_reviews" }
        }
    },
    {
        // Faza 5: sortiranje proizvoda na osnovu broja reviews
        $sort: {
            "reviews_count": -1
        }
    },
    {
        // Faza 6: izdvajanje top 20 proizvoda na osnovu broja reviews
        $limit: 20
    },
    {
        // Faza 7: rastavljanje na zasebne dokumente kako bi se moglo kasnije uraditi grupisanje
        $unwind: "$product_reviews"
    },
    {
        // Faza 8: grupisanje proizvoda na osnovu samog product_id i godine kad je nastala recenzija
        $group: {
            "_id": {
                "product_id": "$product_id",
                "year": "$product_reviews.review_year"
            },
            "avg_rating": { $avg: "$product_reviews.rating_review" },
            "product_name": { $first: "$product_name" },
            "brand_name": { $first: "$brand_name" },
            "number_of_reviews_per_year": { $sum: 1 },
            "total_reviews_count": { $first: "$reviews_count" }
        }
    },
    {
        // Faza 9: sortiranje na osnovu samog id proizvoda i onda na osnovu godine
        $sort: {
            "_id.product_id": 1,
            "_id.year": 1
        }
    },
    {
        // Faza 10: konacni prikaz samih proizvoda i njihovih recenzija u vidu trendova
        $project: {
            "_id": 0,
            "product_id": "$_id.product_id",
            "year": "$_id.year",
            "product_name": 1,
            "brand_name": 1,
            "total_reviews_count": 1,
            "number_of_reviews_per_year": 1,
            "avg_rating": { $round: ["$avg_rating", 4] }
        }
    }
],
    { allowDiskUse: true });
``` 

### Rezultat upita: 

![alt text](query3-results.png)

### Performanse:
Vreme trajanja upita: 47:26.620

Uočavanje uskih grla:

![alt text](query3-explain.png)
- Uočena su uska grla..

## Upit 4

### Tekst upita: 
Analiza najaktivnijih kupaca po brendovima - Koji kupci najčešće pišu recenzije za proizvode istog brenda (5 ili više recenzija za proizvode istog brenda) i da li se njihovo mišljenje o tom brendu (prosečna ocena, procenat preporuke, prosečna korisnost recenzije) razlikuje od proseka svih kupaca tog brenda? Cilj je otkriti stavove aktivnih kupaca i otkriti njihove stavove u ocenjivanju.

### Kod upita: 
``` 
db.getCollection("reviews").aggregate([
    {
        // Faza 1: spajanje recenzija sa samim proizvodima zbog informacija o brendovima
        $lookup: {
            from: "product_info",
            localField: "product_id",
            foreignField: "product_id",
            as: "product",
            pipeline: [
                {
                    $project: {
                        "_id": 0,
                        "brand_id": 1,
                        "brand_name": 1
                    }
                },
                { $limit: 1 }
            ]
        }
    },
    {
        // Faza 2: uveravanje da product nije prazan ni u jednom slucaju, inace se odbacuje
        $match: {
            $expr: { $eq: [{ $size: "$product" }, 1] }
        }
    },
    {
        // Faza 3: razmotavanje dobijenog product iz niza u jedan json objekat
        $unwind: "$product"
    },
    {
        // Faza 4: grupisanje recenzija uz kupce i brendove
        $group: {
            "_id": {
                "author_id": "$author_id",
                "brand_id": "$product.brand_id"
            },
            "brand_name": { $first: "$product.brand_name" },
            "broj_recenzija_za_brend": { $sum: 1 },
            "prosecna_ocena": { $avg: "$rating" },
            "broj_preporuka_proizvoda": { $sum: { $cond: ["$is_recommended", 1, 0] } },
            "prosecna_korisnost": { $avg: "$helpfulness" }
        }
    },
    {
        // Faza 5: grupisanje po samom brand_name, da otkrijemo koji to brendovi imaju lojalne kupce i koliko u odnosu na obicne
        $group: {
            "_id": {
                "brand_name": "$brand_name",
                "brand_id": "$_id.brand_id"
            },
            "buyers": {
                $push: {
                    $cond: {
                        if: { $gte: ["$broj_recenzija_za_brend", 5] },
                        then: {
                            author_id: "$_id.author_id",
                            broj_recenzija_za_brend: "$broj_recenzija_za_brend",
                            prosecna_ocena: "$prosecna_ocena",
                            broj_preporuka_proizvoda: "$broj_preporuka_proizvoda",
                            prosecna_korisnost: "$prosecna_korisnost"
                        },
                        else: "$$REMOVE"
                    }

                }
            },
            "broj_kupaca": { $sum: 1 },
            "prosek_broj_recenzija_za_brend": { $avg: "$broj_recenzija_za_brend" },
            "prosecna_ocena_kupaca": { $avg: "$prosecna_ocena" },
            "broj_preporuka_proizvoda_generalno": { $sum: "$broj_preporuka_proizvoda" },
            "generalna_prosecna_korisnost": { $avg: "$prosecna_korisnost" },
            "suma_ocena_lojalnih": {
                $sum: {
                    $cond: [{ $gte: ["$broj_recenzija_za_brend", 5] }, "$prosecna_ocena", 0]
                }
            },
            "suma_ocena_prosecnih": {
                $sum: {
                    $cond: [{ $gte: ["$broj_recenzija_za_brend", 5] }, 0, "$prosecna_ocena"]
                }
            }
        }
    },
    {
        // Faza 6: prebrojavanje onih zaista lojalnih kupaca
        $addFields: {
            "broj_lojalnih_kupaca": { $size: "$buyers" },
            "prosecna_ocena_lojalnih": {
                $cond: [
                    { $eq: [{ $size: "$buyers" }, 0]},
                    null,
                    { $divide: ["$suma_ocena_lojalnih", { $size: "$buyers" }]}
                ]
            },
            "prosecna_ocena_prosecnih": {
                $cond: [
                    { $eq: [ {$subtract: ["$broj_kupaca", { $size: "$buyers" }]}, 0]},
                    null,
                    { $divide: ["$suma_ocena_prosecnih", { $subtract: ["$broj_kupaca", { $size: "$buyers" }] }]}
                ]
            }
        }
    },
    {
        // Faza 7: sortiranje rezultata u opadajucem redosledu broja lojalnih kupaca
        $sort: {
            "broj_lojalnih_kupaca": -1,
            "brand_name": 1
        }
    },
    {
        // Faza 8: konacni prikaz brendova i njegovih lojalnih korisnika
        $project: {
            "_id": 0,
            "brand_name": "$_id.brand_name",
            "brand_id": "$_id.brand_id",
            "buyers": 1,
            "broj_kupaca": 1,
            "broj_lojalnih_kupaca": 1,
            "prosek_broj_recenzija_za_brend": { $round: ["$prosek_broj_recenzija_za_brend", 4] },
            "prosecna_ocena_kupaca": { $round: ["$prosecna_ocena_kupaca", 4] },
            "prosecna_ocena_lojalnih": { $round: ["$prosecna_ocena_lojalnih", 4] },
            "prosecna_ocena_prosecnih" : { $round: ["$prosecna_ocena_prosecnih", 4] },
            "broj_preporuka_proizvoda_generalno": 1,
            "generalna_prosecna_korisnost": { $round: ["$generalna_prosecna_korisnost", 4] },
        }
    }
],
    { allowDiskUse: true });
``` 

### Rezultat upita: 

![alt text](query4-results.png)

### Performanse:
Vreme trajanja upita: 1:16:21.069

Uočavanje uskih grla:

![alt text](query4-explain.png)
- Uočena su uska grla..


## Upit 5

### Tekst upita: 
Analiza odnosa cene i percepcije vrednosti - Da li proizvodi u različitim cenovnim rangovima (budget, mid, premium, luxury) unutar primarne kategorije 'Skincare' iz iste sekundarne kategorije nose i proporcionalnu veću vrednost za kupca (izraženu kao loves_count i rating u odnosu na cenu) ili jeftiniji proizvodi nude bolji odnos cene i kvaliteta u odnosu na skuplje verzije?

### Kod upita: 
``` 
``` 

### Rezultat upita: 

![alt text](query5-results.png)

### Performanse:
Vreme trajanja upita: 10:39.061

Uočavanje uskih grla:

![alt text](query5-explain.png)
- Uočena su uska grla..
