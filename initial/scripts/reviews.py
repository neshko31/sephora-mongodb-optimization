import csv
import glob
import os

import pymongo
from dateutil import parser
from tqdm import tqdm


class ReviewParser:
    """
    Parsira sve reviews_<x>-<y>.csv fajlove u datom direktorijumu i ubacuje
    recenzije u MongoDB kolekciju 'reviews'.

    Pre unosa svaki review se proverava protiv skupa važećih product_id
    vrednosti (dobijenih iz ProductParser.get_product_ids()) - review čiji
    product_id ne postoji u product_info se odbacuje.
    """

    def __init__(self, dir):
        self._dir = dir

    def add_reviews_to_db(self, url, db_name, product_ids):
        client = pymongo.MongoClient(url)
        db = client[db_name]

        review_files = sorted(glob.glob(os.path.join(self._dir, 'reviews_*.csv')))

        if not review_files:
            print(f"\tNijedan fajl 'reviews_*.csv' nije pronađen u '{self._dir}'")
            return

        total_inserted = 0
        total_skipped_missing_product = 0
        total_skipped_bad_row = 0

        for file_path in review_files:
            file_name = os.path.basename(file_path)

            with open(file_path, 'r', encoding='utf-8-sig', errors='replace', newline='') as csv_file:
                reader = csv.DictReader(csv_file)
                rows = list(reader)

            reviews = []
            for row in tqdm(rows, desc=f'\t{file_name}', unit='recenzija'):
                row_product_id = row.get('product_id')

                if row_product_id not in product_ids:
                    total_skipped_missing_product += 1
                    continue

                try:
                    reviews.append(get_review(row))
                except Exception as e:
                    total_skipped_bad_row += 1
                    tqdm.write(f"\t\tPreskočen loš red (#={row.get('#')}): {e}")

            if reviews:
                for batch in _chunked(reviews, 1000):
                    db['reviews'].insert_many(batch)
                total_inserted += len(reviews)

        print(f"Ukupno upisano recenzija: {total_inserted}")
        print(f"Preskočeno (nepostojeći product_id): {total_skipped_missing_product}")
        print(f"Preskočeno (loš/nevalidan red): {total_skipped_bad_row}")


def get_review(row) -> dict:
    return {
        'review_number': none_if_empty(row.get('#')),
        'author_id': none_if_empty(row.get('author_id')),
        'rating': to_number(row.get('rating')),
        'is_recommended': to_bool(row.get('is_recommended')),
        'helpfulness': to_number(row.get('helpfulness')),
        'total_feedback_count': to_number(row.get('total_feedback_count')),
        'total_neg_feedback_count': to_number(row.get('total_neg_feedback_count')),
        'total_pos_feedback_count': to_number(row.get('total_pos_feedback_count')),
        'submission_time': to_datetime(row.get('submission_time')),
        'review_text': none_if_empty(row.get('review_text')),
        'review_title': none_if_empty(row.get('review_title')),
        'skin_tone': none_if_empty(row.get('skin_tone')),
        'eye_color': none_if_empty(row.get('eye_color')),
        'skin_type': none_if_empty(row.get('skin_type')),
        'hair_color': none_if_empty(row.get('hair_color')),
        'product_id': row.get('product_id'),
    }


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
    return value.strip().lower() in ('1', 'true', '1.0')


def to_datetime(value):
    value = none_if_empty(value)
    if value is None:
        return None
    try:
        return parser.parse(value)
    except (ValueError, OverflowError):
        return None


def _chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]