-- Keep the original forecast when recording the actual payment/receipt.
ALTER TABLE movements ADD COLUMN actual_amount INTEGER CHECK(actual_amount >= 0);
CREATE UNIQUE INDEX idx_setting_title_unique ON settings(title);
