const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
require('dotenv').config();

const port = process.env.PORT || 5005;
// console.log(port);
const app = express();
app.use(express.json());
app.use(cors());  // cross-origin resource sharing -> enables CORS for all routes

const dbPath = path.join(__dirname, 'roxiler.db');
let db = null;

const initializeDBAndServer = async () => {
    try {
        db = await open({
          filename: dbPath,
          driver: sqlite3.Database,
        });
        if (port == 5005) {
          app.listen(port, () => {
            console.log(`Server Running at http://localhost:${port}/`);
          });
        }
    } catch (err) {
        console.log(`DB Error: ${err.message}`);
        process.exit(1);
    }
}

initializeDBAndServer();

app.get('/', async (req, res) => {
    res.json({ message: 'Welcome to Roxiler! :)', 
      tryOut: 'below API endpoints:',
      transactions: '/transactions?month=6&search=4tb',
      statistics: '/statistics?month=3'
    });
});

// API-1 GET all transactions with pagination and search functionality
app.get('/transactions', async (req, res) => { 
    try {
      const { month, search='', page=1, size=10 } = req.query;
      const orderBy = isNaN(search) ? 'id' : 'price DESC, id';
      const price_range = isNaN(search) ? 'price = ?' : 'price <= ?';
      // console.log(isNaN(search), search);

      const query = `
        SELECT * 
        FROM products
        WHERE (? IS NULL OR CAST(strftime('%m', date_of_sale) AS INT) = ?)
          AND (LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR ${price_range})
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?;
      `;
      const query_result = await db.all(query, [
        month || null, month || null, `%${search}%`, `%${search}%`, isNaN(search) ? Number.MAX_SAFE_INTEGER : search,
        size, (page-1)*size
      ]);

      const countQuery = `
        SELECT COUNT(*) as total_products
        FROM products
        WHERE (? IS NULL OR CAST(strftime('%m', date_of_sale) AS INT) = ?)
          AND (LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR ${price_range});
      `;
      const { total_products } = await db.get(countQuery, [
        month || null, month || null, `%${search}%`, `%${search}%`, isNaN(search) ? Number.MAX_SAFE_INTEGER : search
      ]);
      const totalPages = Math.ceil(total_products / size);
      const hasNextPage = page < totalPages;
      res.status(200).send({ query_result, hasNextPage });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

// API-2 GET statistics of total sales, total items sold, and total items not sold
app.get('/statistics', async (req, res) => {
    try {
        const { month } = req.query;
        const query = `
          SELECT 
            SUM(CASE WHEN sold = 1 THEN price ELSE 0 END)  as totalSales,
            COUNT(CASE WHEN sold = 1 THEN 1 END) as totalItemsSold,
            COUNT(CASE WHEN sold = 0 THEN 1 END) as totalItemsNotSold
          FROM products
          WHERE (? IS NULL OR CAST(strftime('%m', date_of_sale) AS INT) = ?);
        `;
        const statistics = await db.get(query, [month || null, month || null]);
        res.status(200).json(statistics);
        // res.status(200).json({
        //   totalSales: statistics.totalSales+'₹',
        //   totalItemsSold: statistics.totalItemsSold,
        //   totalItemsNotSold: statistics.totalItemsNotSold
        // });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

// API-3 GET price range and # of items in that range
app.get('/price-range', async (req, res) => {
    try {
        const { month } = req.query;
        const query = `
          SELECT 
            COUNT(CASE WHEN (price >= 0 AND price <= 100) THEN 1 END) AS '0-100',
            COUNT(CASE WHEN (price >= 101 AND price <= 200) THEN 1 END) AS '101-200',
            COUNT(CASE WHEN (price >= 201 AND price <= 300) THEN 1 END) AS '201-300',
            COUNT(CASE WHEN (price >= 301 AND price <= 400) THEN 1 END) AS '301-400',
            COUNT(CASE WHEN (price >= 401 AND price <= 500) THEN 1 END) AS '401-500',
            COUNT(CASE WHEN (price >= 501 AND price <= 600) THEN 1 END) AS '501-600',
            COUNT(CASE WHEN (price >= 601 AND price <= 700) THEN 1 END) AS '601-700',
            COUNT(CASE WHEN (price >= 701 AND price <= 800) THEN 1 END) AS '701-800',
            COUNT(CASE WHEN (price >= 801 AND price <= 900) THEN 1 END) AS '801-900',
            COUNT(CASE WHEN (price >= 901) THEN 1 END) AS '901-above'
          FROM products
          WHERE (? IS NULL OR CAST(strftime('%m', date_of_sale) AS INT) = ?);
        `;
        const priceRange = await db.get(query, [month || null, month || null]);
        res.status(200).json(priceRange);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

// API-4 GET unique categories and # of items belongs to that category
app.get('/categories', async (req, res) => {
    try {
        const { month } = req.query;
        const query = `
          SELECT category, COUNT(*) as totalItems
          FROM products
          WHERE (? IS NULL OR CAST(strftime('%m', date_of_sale) AS INT) = ?)
          GROUP BY category;
        `;
        const categories = await db.all(query, [month || null, month || null]);
        res.status(200).json(categories);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

// API-5 GET the combined data of API-2, API-3, and API-4
app.get('/combined-data', async (req, res) => {
    try {
      const { month } = req.query;
      const query = `
        SELECT 
          SUM(CASE WHEN sold = 1 THEN price ELSE 0 END)  as totalSales,
          COUNT(CASE WHEN sold = 1 THEN 1 END) as totalItemsSold,
          COUNT(CASE WHEN sold = 0 THEN 1 END) as totalItemsNotSold,

          COUNT(CASE WHEN (price >= 0 AND price <= 100) THEN 1 END) AS '0-100',
          COUNT(CASE WHEN (price >= 101 AND price <= 200) THEN 1 END) AS '101-200',
          COUNT(CASE WHEN (price >= 201 AND price <= 300) THEN 1 END) AS '201-300',
          COUNT(CASE WHEN (price >= 301 AND price <= 400) THEN 1 END) AS '301-400',
          COUNT(CASE WHEN (price >= 401 AND price <= 500) THEN 1 END) AS '401-500',
          COUNT(CASE WHEN (price >= 501 AND price <= 600) THEN 1 END) AS '501-600',
          COUNT(CASE WHEN (price >= 601 AND price <= 700) THEN 1 END) AS '601-700',
          COUNT(CASE WHEN (price >= 701 AND price <= 800) THEN 1 END) AS '701-800',
          COUNT(CASE WHEN (price >= 801 AND price <= 900) THEN 1 END) AS '801-900',
          COUNT(CASE WHEN (price >= 901) THEN 1 END) AS '901-above'
        FROM products
        WHERE (? IS NULL OR CAST(strftime('%m', date_of_sale) AS INT) = ?);
      `;

      const query1 = `
        SELECT category, COUNT(*) as totalItems
        FROM products
        WHERE (? IS NULL OR CAST(strftime('%m', date_of_sale) AS INT) = ?)
        GROUP BY category;
      `;

      const combinedData = await db.all(query, [month || null, month || null]);
      const categories = await db.all(query1, [month || null, month || null]); 
      res.status(200).json({ combinedData, categories });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
});


/* for API-5
const { month=3, page=1, size=10, search='' } = req.query;
        const transactionsUrl = `https://roxilerdb.onrender.com/transactions?month=${month}&search=${search}&page=${page}&size=${size}`;
        const statisticsUrl = `https://roxilerdb.onrender.com/statistics?month=${month}`;
        const priceRangeUrl = `https://roxilerdb.onrender.com/price-range?month=${month}`;
        const categoriesUrl = `https://roxilerdb.onrender.com/categories?month=${month}`;

        const [transactionsData, statisticsData, priceRangeData, categoriesData] = await Promise.all([
            axios.get(transactionsUrl).then(response => response.data),
            axios.get(statisticsUrl).then(response => response.data),
            axios.get(priceRangeUrl).then(response => response.data),
            axios.get(categoriesUrl).then(response => response.data)
        ]);

        const combinedData = {
          transactionsData,
          statisticsData,
          priceRangeData,
          categoriesData,
          month, page, size, search
        };
        res.status(200).json(combinedData);
*/