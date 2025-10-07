/*
  # Milk Collection System Schema

  ## New Tables
  
  ### 1. `farmers`
    - `farmer_id` (text, primary key) - Member/Farmer ID (e.g., #M00001)
    - `name` (text) - Farmer's full name
    - `route` (text) - Collection route code (e.g., T001)
    - `route_name` (text) - Full route name (e.g., A Main Collection)
    - `member_route` (text) - Member's specific route (e.g., T018)
    - `phone` (text, optional) - Contact number
    - `created_at` (timestamptz) - Registration date
    
  ### 2. `app_users`
    - `user_id` (text, primary key) - User login ID
    - `password` (text) - Password (hashed in production)
    - `name` (text) - Full name (e.g., KANANU MUGAMBI)
    - `role` (text) - User role (clerk, admin, etc.)
    - `created_at` (timestamptz) - Account creation date
    
  ### 3. `milk_collection`
    - `id` (uuid, primary key) - Unique collection ID
    - `reference_no` (text) - Receipt reference (e.g., AG041021000)
    - `farmer_id` (text, foreign key) - References farmers table
    - `farmer_name` (text) - Cached farmer name
    - `weight` (numeric) - Milk weight in Kg
    - `route` (text) - Collection route
    - `route_name` (text) - Full route name
    - `member_route` (text) - Member's route
    - `section` (text) - Session (AM/PM)
    - `collected_by` (text, foreign key) - References app_users
    - `clerk_name` (text) - Cached clerk name
    - `price_per_liter` (numeric) - Rate per liter
    - `total_amount` (numeric) - Calculated total
    - `collection_date` (timestamptz) - Collection timestamp
    - `created_at` (timestamptz) - Record creation
    
  ### 4. `collection_items`
    - `id` (uuid, primary key)
    - `collection_id` (uuid, foreign key) - References milk_collection
    - `item_reference` (text) - Item reference (e.g., AG041021000-1)
    - `weight` (numeric) - Individual item weight
    - `sequence` (integer) - Item sequence number
    
  ## Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create farmers table
CREATE TABLE IF NOT EXISTS farmers (
  farmer_id text PRIMARY KEY,
  name text NOT NULL,
  route text NOT NULL,
  route_name text,
  member_route text,
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE farmers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read farmers"
  ON farmers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert farmers"
  ON farmers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update farmers"
  ON farmers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
  user_id text PRIMARY KEY,
  password text NOT NULL,
  name text NOT NULL,
  role text DEFAULT 'clerk',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON app_users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert"
  ON app_users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create milk_collection table
CREATE TABLE IF NOT EXISTS milk_collection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no text UNIQUE NOT NULL,
  farmer_id text NOT NULL,
  farmer_name text NOT NULL,
  weight numeric NOT NULL,
  route text NOT NULL,
  route_name text,
  member_route text,
  section text NOT NULL,
  collected_by text NOT NULL,
  clerk_name text NOT NULL,
  price_per_liter numeric DEFAULT 50,
  total_amount numeric NOT NULL,
  collection_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
  FOREIGN KEY (collected_by) REFERENCES app_users(user_id)
);

ALTER TABLE milk_collection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read collections"
  ON milk_collection FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert collections"
  ON milk_collection FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update collections"
  ON milk_collection FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create collection_items table (for multiple items in one collection)
CREATE TABLE IF NOT EXISTS collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL,
  item_reference text NOT NULL,
  weight numeric NOT NULL,
  sequence integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY (collection_id) REFERENCES milk_collection(id) ON DELETE CASCADE
);

ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read collection items"
  ON collection_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert collection items"
  ON collection_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_milk_collection_farmer_id ON milk_collection(farmer_id);
CREATE INDEX IF NOT EXISTS idx_milk_collection_date ON milk_collection(collection_date);
CREATE INDEX IF NOT EXISTS idx_milk_collection_reference ON milk_collection(reference_no);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id);

-- Insert sample data for testing
INSERT INTO farmers (farmer_id, name, route, route_name, member_route)
VALUES 
  ('#M00001', 'JAMES GICHURU', 'T001', 'A Main Collection', 'T018')
ON CONFLICT (farmer_id) DO NOTHING;

INSERT INTO app_users (user_id, password, name, role)
VALUES 
  ('clerk1', 'password123', 'KANANU MUGAMBI', 'clerk'),
  ('admin', 'admin123', 'ADMIN USER', 'admin')
ON CONFLICT (user_id) DO NOTHING;
