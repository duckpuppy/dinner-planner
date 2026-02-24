ALTER TABLE `dinner_entries` ADD `source_entry_id` text REFERENCES dinner_entries(id);
