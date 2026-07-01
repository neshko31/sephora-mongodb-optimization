// Upit 1
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






//Upit2
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






// Upit 3
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






// Upit 4
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






// Upit 5
db.getCollection("reviews").aggregate([
  {
    $match: {
      "review_text": { 
        $regex: /free sample|gifted by|incentivized|complimentary|voxbox/i 
      },
      "is_recommended": { $exists: true }
    }
  },
  {
    $group: {
      "_id": "$product_id",
      "broj_sponzorisanih_recenzija": { $sum: 1 },
      "prosecna_ocena_sponzorisanih": { $avg: "$rating" }
    }
  },
  {
    $match: {
      "broj_sponzorisanih_recenzija": { $gte: 5 }
    }
  },
  {
    $lookup: {
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
    $addFields: {
      "indeks_pristrasnosti": { 
        $subtract: ["$prosecna_ocena_sponzorisanih", "$detalji_proizvoda.rating"] 
      }
    }
  },
  {
    $match: {
      "indeks_pristrasnosti": { $gt: 0 }
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
