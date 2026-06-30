from products import ProductParser
from reviews import ReviewParser
import os
 
DATA_DIR = 'data'
MONGO_URL = 'mongodb://localhost:27017/'
DB_NAME = 'SBP-Projekat-initial'
 
if __name__ == '__main__': 
    print("Unos proizvoda!")
    product_parser = ProductParser(os.path.join(DATA_DIR, 'product_info.csv'))
    product_parser.add_products_to_db(url=MONGO_URL, db_name=DB_NAME)
 
    print("Unos recenzija!")
    review_parser = ReviewParser(DATA_DIR)
    review_parser.add_reviews_to_db(url=MONGO_URL, db_name=DB_NAME, product_ids=product_parser.get_product_ids())

    print("Završen unos!")
 