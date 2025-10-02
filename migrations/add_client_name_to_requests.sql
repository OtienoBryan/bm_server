-- Migration to add client_name column to requests table
-- This allows storing client names for Adhoc requests

ALTER TABLE requests ADD COLUMN client_name VARCHAR(255) NULL AFTER longitude;


