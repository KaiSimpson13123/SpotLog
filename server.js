const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Set up middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Set up SQLite database
const db = new sqlite3.Database('planes.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS planes (
        id INTEGER PRIMARY KEY,
        image_filename TEXT,
        airline TEXT,
        plane_icao TEXT,
        plane_reg TEXT,
        date_taken TEXT,
        location TEXT
    )`);
});

// Set up file upload with multer
const upload = multer({ dest: 'public/uploads/' });

// Function to get statistics
function getStatistics(callback) {
    const statistics = {
        totalPhotos: 0,
        airlineCount: {},
        icaoCount: {}
    };

    // Total photos
    db.get(`SELECT COUNT(*) AS count FROM planes`, (err, row) => {
        if (err) return callback(err);
        statistics.totalPhotos = row.count;

        // Count by airline
        db.all(`SELECT airline, COUNT(*) AS count FROM planes GROUP BY airline`, (err, rows) => {
            if (err) return callback(err);
            rows.forEach(row => {
                statistics.airlineCount[row.airline] = row.count;
            });

            // Count by plane ICAO
            db.all(`SELECT plane_icao, COUNT(*) AS count FROM planes GROUP BY plane_icao`, (err, rows) => {
                if (err) return callback(err);
                rows.forEach(row => {
                    statistics.icaoCount[row.plane_icao] = row.count;
                });

                callback(null, statistics);
            });
        });
    });
}

// Routes
app.get('/', (req, res) => {
    db.all(`SELECT * FROM planes`, (err, rows) => {
        if (err) throw err;
        res.render('index', { rows });
    });
});

app.post('/upload', upload.single('image'), (req, res) => {
    const { airline, plane_icao, plane_reg, date_taken, location } = req.body;
    const fileExtension = path.extname(req.file.originalname);
    const image_filename = req.file.filename + fileExtension;

    const newFilePath = path.join(__dirname, 'public', 'uploads', image_filename);
    fs.renameSync(req.file.path, newFilePath);

    db.run(`INSERT INTO planes (image_filename, airline, plane_icao, plane_reg, date_taken, location) VALUES (?, ?, ?, ?, ?, ?)`,
        [image_filename, airline, plane_icao, plane_reg, date_taken, location]);

    res.redirect('/');
});

// Statistics Route
app.get('/statistics', (req, res) => {
    getStatistics((err, statistics) => {
        if (err) throw err;
        res.render('statistics', { statistics });
    });
});

// Browse Route
app.get('/browse', (req, res) => {
    db.all(`SELECT * FROM planes`, (err, rows) => {
        if (err) throw err;
        res.render('browse_results', { rows });
    });
});

// Search Route
app.get('/search', (req, res) => {
    const { airline, icao, reg, date } = req.query;

    // Build the SQL query based on provided parameters
    let query = `SELECT * FROM planes WHERE 1=1`;
    const params = [];

    if (airline) {
        query += ` AND airline LIKE ?`;
        params.push(`%${airline}%`);
    }

    if (icao) {
        query += ` AND plane_icao LIKE ?`;
        params.push(`%${icao}%`);
    }

    if (reg) {
        query += ` AND plane_reg LIKE ?`;
        params.push(`%${reg}%`);
    }

    if (date) {
        query += ` AND date_taken LIKE ?`;
        params.push(`%${date}%`);
    }

    db.all(query, params, (err, rows) => {
        if (err) throw err;
        res.render('search_results', { rows });
    });
});

// Delete Route
app.post('/delete/:id', (req, res) => {
    const id = req.params.id;

    // Find the image filename from the database
    db.get(`SELECT image_filename FROM planes WHERE id = ?`, [id], (err, row) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }

        if (row) {
            // Remove the image file from the filesystem
            const filePath = path.join(__dirname, 'public', 'uploads', row.image_filename);
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }

                // Delete the entry from the database
                db.run(`DELETE FROM planes WHERE id = ?`, [id], (err) => {
                    if (err) {
                        console.error(err);
                        return res.sendStatus(500);
                    }

                    res.redirect('/');
                });
            });
        } else {
            res.sendStatus(404);
        }
    });
});

app.listen(port, '0.0.0.0', () => {  // Change 'localhost' to '0.0.0.0'
    console.log(`Server running at http://<your-local-ip>:${port}`);
});
