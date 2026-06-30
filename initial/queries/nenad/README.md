# Upiti

## Upit 1

Tekst upita: Analiza hajpa i tagova - Da li proizvodi koji imaju tag 'Vegan' ili ‘Clean + Planet Positive’ u polju highlights imaju značajno višu prosečnu cenu i veći broj lajkova (loves_count) u odnosu na standardne proizvode i da li se oni češće preporučuju?

Kod upita: 
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
            "ukupno_recenzija": { $sum: "$product_reviews.0.broj_recenzija_proizvoda" },
            "broj_preporuka": { $sum: "$product_reviews.0.broj_preporuka_proizvoda" }
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

Rezultat upita: slika

Performanse:
- Vreme trajanja upita: procena je oko 3 sata
- Uocavanje uskih grla
- Prikaz explain naredbe - slika

## Upit 2: Detekcija "Štetnih" sastojaka kroz kategorije - U kojim se sekundarnim kategorijama proizvoda najčešće pojavljuju neželjeni sastojci (npr. 'Alcohol', 'Paraben', 'Sulfate') i prikazati raspodelu ocena iz recenzija za takve kategorije. 


## Upit 3: Strategija popusta - Koji brendovi najagresivnije koriste popuste (najveća razlika između price_usd i sale_price_usd) i da li su ti popusti rezervisani samo za Limited Edition proizvode? 


## Upit 4: Detekcija zasićenosti tržišta po varijacijama - Koji tipovi varijacija (variation_type npr. "Size", "Color/Tone") dominiraju u određenim sekundarnim kategorijama i koji brendovi kreiraju najkompleksnije proizvode (imaju najveći child_count, odnosno broj pod-varijacija)? 


## Upit 5: Hijerarhijska analiza cena - Kako se kreću cene (raspon min-max) kada se spustimo sa primary_category na secondary_category, pa na tertiary_category? (Pomaže u mapiranju najskupljih niša). 
