import ast
import csv

import pymongo
from dateutil import parser
from tqdm import tqdm


class ProductParser:
    """
    Parsira product_info.csv (Sephora skup podataka) i ubacuje proizvode
    u MongoDB kolekciju 'product_info'.
    """

    def __init__(self, file):
        self._file = file
        self._product_ids = set()

    def add_products_to_db(self, url, db_name):
        client = pymongo.MongoClient(url)
        db = client[db_name]

        products = []
        with open(self._file, 'r', encoding='utf-8-sig', errors='replace', newline='') as csv_file:
            reader = csv.DictReader(csv_file)
            rows = list(reader)

            for row in tqdm(rows, desc='Učitavanje proizvoda', unit='proizvod'):
                try:
                    product = get_product(row)
                except Exception as e:
                    tqdm.write(f"\tPreskočen loš red (product_id={row.get('product_id')}): {e}")
                    continue

                products.append(product)
                self._product_ids.add(product['_id'])

        if products:
            for batch in tqdm(list(_chunked(products, 1000)), desc='Upis proizvoda u bazu', unit='batch'):
                db['product_info'].insert_many(batch)

        print(f"Ukupno upisano proizvoda: {len(products)}")

    def get_product_ids(self):
        return self._product_ids


def get_product(row) -> dict:
    return {
        '_id': row['product_id'],
        'product_id': row['product_id'],
        'product_name': none_if_empty(row['product_name']),
        'brand_id': none_if_empty(row['brand_id']),
        'brand_name': none_if_empty(row['brand_name']),
        'loves_count': to_number(row.get('loves_count')),
        'rating': to_number(row.get('rating')),
        'reviews': to_number(row.get('reviews')),
        'size': none_if_empty(row.get('size')),
        'variation_type': split_on_plus(row.get('variation_type')),
        'variation_value': none_if_empty(row.get('variation_value')),
        'variation_desc': none_if_empty(row.get('variation_desc')),
        'price_usd': to_number(row.get('price_usd')),
        'ingredients': to_list(row.get('ingredients')),
        'value_price_usd': to_number(row.get('value_price_usd')),
        'sale_price_usd': to_number(row.get('sale_price_usd')),
        'limited_edition': to_bool(row.get('limited_edition')),
        'new': to_bool(row.get('new')),
        'online_only': to_bool(row.get('online_only')),
        'out_of_stock': to_bool(row.get('out_of_stock')),
        'sephora_exclusive': to_bool(row.get('sephora_exclusive')),
        'highlights': to_list(row.get('highlights')),
        'primary_category': none_if_empty(row.get('primary_category')),
        'secondary_category': none_if_empty(row.get('secondary_category')),
        'tertiary_category': none_if_empty(row.get('tertiary_category')),
        'child_count': to_number(row.get('child_count')),
        'child_max_price': to_number(row.get('child_max_price')),
        'child_min_price': to_number(row.get('child_min_price')),
    }

def split_on_plus(value):
    value = none_if_empty(value)
    if value is None:
        return []
    parts = [part.strip() for part in value.split('+')]
    return [part for part in parts if part != '']

def none_if_empty(value):
    if value is None:
        return None
    value = value.strip()
    return value if value != '' else None


def to_number(value):
    value = none_if_empty(value)
    if value is None:
        return None
    try:
        as_float = float(value)
    except ValueError:
        return None
    if as_float.is_integer():
        return int(as_float)
    return as_float


def to_bool(value):
    value = none_if_empty(value)
    if value is None:
        return False
    return value.strip().lower() in ('1', 'true')


def to_list(value):
    value = none_if_empty(value)
    if value is None:
        return []

    try:
        parsed = ast.literal_eval(value)
    except (ValueError, SyntaxError):
        parsed = [value]

    if not isinstance(parsed, list):
        parsed = [parsed]

    if len(parsed) == 1 and isinstance(parsed[0], str) and ',' in parsed[0]:
        parts = [p.strip() for p in parsed[0].split(',')]
        return [p for p in parts if p != '']

    return [str(p).strip() for p in parsed if str(p).strip() != '']


def _chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]