// Upit 1
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
    
// db.product_info.explain("executionStats").aggregate([]);