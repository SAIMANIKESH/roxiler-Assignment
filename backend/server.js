const express = require('express');
const axios = require('axios');
const https = require('https'); // Required for HTTPS requests
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose(); // Verbose mode for detailed error messages
const path = require('path');
require('dotenv').config(); // Load environment variables

const port = process.env.PORT || 5005;

const app = express();
app.use(express.json()); // Parse JSON bodies

const dbPath = path.join(__dirname, 'roxiler.db');
let db = null;

// Get data from third party API URL
const getData = async () => {
  const apiUrl = process.env.THIRD_PARTY_API_URL;

  // Create an HTTPS Agent with persistent connection 
  const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

  for (let attempt = 1; attempt <= 5; attempt++) { // Increased retries
    try {
      console.log(`🌐 Attempt ${attempt}: Fetching data...`);

      const response = await axios.get(apiUrl, {
        httpsAgent: agent,
        timeout: 10000, // Increased timeout to 10 seconds
        headers: {
          'User-Agent': 'Mozilla/5.0', // Mimic browser request
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      console.log("✅ API data fetched successfully.");
			// console.log(response.data[0].category);
      return response.data; 

    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed:`, err.message);

      if (attempt === 5) {
        console.error("🚫 All retry attempts failed.");
        return [];
      }

      // Exponential backoff for retries
      const delay = Math.pow(2, attempt) * 100;
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Create database and tables if not exists
const createTables = async (db) => {
	// console.log('Creating tables...');
  await db.run(`
    CREATE TABLE IF NOT EXISTS products (
			id INT NOT NULL PRIMARY KEY,
			title TEXT,
			price Float,
			description TEXT,
			category TEXT,
			image_url TEXT,
			sold BOOLEAN,
			date_of_sale TEXT
  	);
	`);
	// console.log('Tables created');
}

// Insert data into the database
const insertRows = async (db) => {
	const productsData = await getData();
  console.log(`📦 Total products fetched: ${productsData.length}`);
  
	if (!productsData.length) {
    console.error("🚫 No data fetched to insert.");
    return;
  }

  let query = `
      INSERT OR IGNORE INTO products 
        (id, title, price, description, category, image_url, sold, date_of_sale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

    try {
      // console.log(`🟢 Inserting Product ID: ${product.id}`); // Log before insert
      productsData.forEach(product => {
        db.run(query, Object.values(product)); 
      });
      // console.log(`✅ Inserted Product ID: ${product.id}`);
    } catch (err) {
      console.error(`❌ Error inserting Product ID ${product.id}:`, err.message);
    }
}

// Get all products from the database
app.get('/', async (req, res) => {
	try {
		const products = await db.all('SELECT * FROM products ORDER BY id');
		res.status(200).json(products);
	} catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});


// Start the server
const startServer = async () => {
	try {
		db = await open({ 
			filename: dbPath, 
			driver: sqlite3.Database 
		});

		await createTables(db);
		await insertRows(db);

		app.listen(port, () => {
			console.log(`Server running at http://localhost:${port}/`);
		});
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
}

startServer();