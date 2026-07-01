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