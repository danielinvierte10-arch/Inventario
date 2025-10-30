// backend/server.js
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());
// Sirve el frontend desde el backend tambiÃ©n, por si acaso
app.use(express.static(path.join(__dirname, '../frontend')));
// --- CONFIGURACIÃ“N DE LA BASE DE DATOS (NO CAMBIAR) ---
app.use(cors({
    origin: '*', // Permite solicitudes desde cualquier origen
    credentials: true
}));
// ConfiguraciÃ³n de la base de datos - VERIFICA ESTOS VALORES
const dbConfig = {
    user: 'sa',
    password: 'Spill$184',
    server: '200.91.92.132',
    port: 9933,
    database: 'CODEAS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectionTimeout: 120000,  // 2 minutos
        requestTimeout: 300000,     // 5 minutos (aumentado)
        cancelTimeout: 60000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};
// --- CONEXIÃ“N A LA BASE DE DATOS ---
sql.connect(dbConfig).then(pool => {
    console.log('âœ… Conectado a la base de datos SQL Server');
    return pool;
}).catch(err => {
    console.error('âŒ Error conectando a la base de datos:', err.message);
});

// --- RUTAS DE LA API (SOLO LAS QUE YA FUNCIONABAN) ---

// 1. Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;


        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        // Limpiar espacios en blanco como en Python
        const codUsuario = username.trim();
        const clave = password.trim();

        const request = new sql.Request();
        request.input('cod_usuario', sql.VarChar, codUsuario);

        const result = await request.query(`
            SELECT CodUsuario, NomUsuario, Clave, Tipo, Estado 
            FROM USUARIOS 
            WHERE CodUsuario = @cod_usuario
        `);

        if (result.recordset.length > 0) {
            const user = result.recordset[0];


            // Limpiar los valores de la base de datos como en Python
            const codUser = user.CodUsuario ? user.CodUsuario.toString().trim() : '';
            const nomUsuario = user.NomUsuario ? user.NomUsuario.toString().trim() : '';
            const claveDb = user.Clave ? user.Clave.toString().trim() : '';
            const tipo = user.Tipo ? user.Tipo.toString().trim() : '';
            const estado = user.Estado ? user.Estado.toString().trim() : '';

            console.log('Valores limpios de BD:', {
                codUser: JSON.stringify(codUser),
                nomUsuario: JSON.stringify(nomUsuario),
                claveDb: JSON.stringify(claveDb),
                tipo: JSON.stringify(tipo),
                estado: JSON.stringify(estado)
            });


            // Verificar estado
            if (estado !== 'A') {
                return res.json({ success: false, message: 'Este usuario estÃ¡ inactivo' });
            }

            // Verificar tipo
            if (tipo !== 'A' && tipo !== 'E') {
                return res.json({ success: false, message: 'Tipo de usuario no vÃ¡lido' });
            }

            // Comparar contraseÃ±as
            if (clave === claveDb) {
                res.json({
                    success: true,
                    user: {
                        username: codUser,
                        role: tipo === 'A' ? 'admin' : 'worker',
                        name: nomUsuario
                    }
                });
            } else {
                res.json({ success: false, message: 'Contraseña incorrecta' });
            }
        } else {
            res.json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});
// 2. Consecutivos
// Ruta para obtener los Ãºltimos 3 consecutivos
app.get('/api/consecutivos', async (req, res) => {
    try {

        const result = await sql.query(`
            SELECT DISTINCT TOP 3 consec 
            FROM CONSULTA_TOMA_FISICA_TF_DET 
            ORDER BY consec DESC
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener consecutivos:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message,
            suggestion: 'Verifique la conexiÃ³n a la base de datos'
        });
    }
});

// 3. Localizaciones por consecutivo
app.get('/api/localizaciones/:consecutivo', async (req, res) => {
    try {
        const { consecutivo } = req.params;
        const request = new sql.Request();
        request.input('consecutivo', sql.Int, parseInt(consecutivo));
        const result = await request.query(`
            SELECT DISTINCT CodLocaliz 
            FROM CONSULTA_TOMA_FISICA_TF_DET 
            WHERE consec = @consecutivo
            ORDER BY CodLocaliz
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener localizaciones:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/trabajadores', async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT CodUsuario, NomUsuario, Estado, Tipo
            FROM USUARIOS
            WHERE Estado = 'A' AND Tipo = 'E'
            ORDER BY NomUsuario
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener trabajadores:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/api/resetear-tablas', async (req, res) => {
    try {
        const { tablas } = req.body;

        if (!tablas || !Array.isArray(tablas)) {
            return res.status(400).json({ error: 'Tablas a resetear son requeridas' });
        }

        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            for (const tabla of tablas) {
                if (tabla === 'TOMA_FISICA' || tabla === 'TOMA_FISICA_DET') {
                    const request = new sql.Request(transaction);
                    await request.query(`DELETE FROM ${tabla}`);
                }
            }

            await transaction.commit();
            res.json({ success: true, message: 'Tablas reseteadas correctamente' });
        } catch (err) {
            await transaction.rollback();
            console.error('Error en transacciÃ³n de reseteo:', err);
            throw err;
        }
    } catch (err) {
        console.error('Error al resetear tablas:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message,
            suggestion: 'Verifique la conexiÃ³n a la base de datos'
        });
    }
});

// 5. Asignar tarea
app.post('/api/asignar-tarea', async (req, res) => {
    try {
        const { user, consecutivo, localizaciones } = req.body; // localizaciones es un array
        const transaction = new sql.Transaction();
        await transaction.begin();
        try {
            for (const localizacion of localizaciones) {
                const request = new sql.Request(transaction);
                request.input('cons', sql.Int, parseInt(consecutivo));
                request.input('localiz', sql.VarChar, localizacion);
                request.input('usuario', sql.VarChar, user);
                await request.query(`
                    INSERT INTO TOMA_FISICA (Cons, Localiz, Usuario) 
                    VALUES (@cons, @localiz, @usuario)
                `);
            }
            await transaction.commit();
            res.json({ success: true, message: 'Tarea(s) asignada(s) correctamente' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Error al asignar tarea:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/productos-reconteo/:consecutivo/:localizacion', async (req, res) => {
    try {
        const { consecutivo, localizacion } = req.params;

        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));
        request.input('localiz', sql.VarChar, localizacion);

        // âœ… CORREGIDO: Agregado COLLATE DATABASE_DEFAULT en todos los JOINs y comparaciones
        const result = await request.query(`
            SELECT 
                d.Cons,
                d.Localiz,
                d.CodProd,
                CASE 
                    WHEN c.NomProd IS NOT NULL THEN c.NomProd COLLATE DATABASE_DEFAULT
                    WHEN ce.NomProd IS NOT NULL THEN ce.NomProd COLLATE DATABASE_DEFAULT
                    ELSE 'Sin nombre' COLLATE DATABASE_DEFAULT
                END as NomProd,
                d.Existencia,
                d.Conteo,
                d.Reconteo
            FROM TOMA_FISICA_DET d
            LEFT JOIN CONSULTA_TOMA_FISICA_TF_DET c
                ON d.CodProd COLLATE DATABASE_DEFAULT = c.CodProd COLLATE DATABASE_DEFAULT
                AND d.Cons = c.consec
                AND d.Localiz COLLATE DATABASE_DEFAULT = c.CodLocaliz COLLATE DATABASE_DEFAULT
            LEFT JOIN (
                SELECT DISTINCT 
                    CodProd COLLATE DATABASE_DEFAULT as CodProd, 
                    NomProd COLLATE DATABASE_DEFAULT as NomProd
                FROM CONSULTA_EXISTENCIAS
            ) ce ON d.CodProd COLLATE DATABASE_DEFAULT = ce.CodProd COLLATE DATABASE_DEFAULT
            WHERE d.Cons = @cons 
                AND d.Localiz COLLATE DATABASE_DEFAULT = @localiz COLLATE DATABASE_DEFAULT
                AND ISNULL(d.Existencia, 0) <> ISNULL(d.Conteo, 0)
            ORDER BY d.CodProd
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('âŒ Error al obtener productos para reconteo:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.get('/api/productos-reconteo', async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                d.Cons,
                d.Localiz,
                d.CodProd,
                CASE 
                    WHEN c.NomProd IS NOT NULL THEN c.NomProd COLLATE DATABASE_DEFAULT
                    WHEN ce.NomProd IS NOT NULL THEN ce.NomProd COLLATE DATABASE_DEFAULT
                    ELSE 'Sin nombre' COLLATE DATABASE_DEFAULT
                END as NomProd,
                d.Existencia,
                d.Conteo,
                d.Reconteo,
                CASE 
                    WHEN c.DescBodega IS NOT NULL THEN c.DescBodega COLLATE DATABASE_DEFAULT
                    WHEN ce2.DescBodega IS NOT NULL THEN ce2.DescBodega COLLATE DATABASE_DEFAULT
                    ELSE 'Sin bodega' COLLATE DATABASE_DEFAULT
                END as DescBodega
            FROM TOMA_FISICA_DET d
            LEFT JOIN CONSULTA_TOMA_FISICA_TF_DET c
                ON d.CodProd COLLATE DATABASE_DEFAULT = c.CodProd COLLATE DATABASE_DEFAULT
                AND d.Cons = c.consec
                AND d.Localiz COLLATE DATABASE_DEFAULT = c.CodLocaliz COLLATE DATABASE_DEFAULT
            LEFT JOIN CONSULTA_EXISTENCIAS ce
                ON d.CodProd COLLATE DATABASE_DEFAULT = ce.CodProd COLLATE DATABASE_DEFAULT
            LEFT JOIN (
                SELECT DISTINCT consec, DescBodega 
                FROM CONSULTA_TOMA_FISICA_TF_DET
            ) ce2 ON d.Cons = ce2.consec
            WHERE ISNULL(d.Existencia, 0) <> ISNULL(d.Conteo, 0)
            ORDER BY d.Cons, d.Localiz, d.CodProd
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('âŒ Error al obtener productos para reconteo:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// 6. Productos por consecutivo y localizaciÃ³n (OPTIMIZADO)
app.get('/api/productos/:consecutivo/:localizacion', async (req, res) => {
    try {
        const { consecutivo, localizacion } = req.params;

        const request = new sql.Request();
        request.input('consecutivo', sql.Int, parseInt(consecutivo));
        request.input('localizacion', sql.VarChar, localizacion);

        // Consulta UNIFICADA con UNION para mejor performance
        const result = await request.query(`
            -- Productos con existencia > 0 de CONSULTA_TOMA_FISICA_TF_DET
            SELECT DISTINCT 
                CodProd COLLATE DATABASE_DEFAULT AS CodProd, 
                NomProd COLLATE DATABASE_DEFAULT AS NomProd,
                Exist AS Existencia
            FROM CONSULTA_TOMA_FISICA_TF_DET 
            WHERE consec = @consecutivo 
            AND CodLocaliz COLLATE DATABASE_DEFAULT = @localizacion COLLATE DATABASE_DEFAULT
            AND CodProd IS NOT NULL 
            AND LTRIM(RTRIM(CodProd)) <> ''
            AND NomProd IS NOT NULL 
            AND LTRIM(RTRIM(NomProd)) <> ''
            
            UNION

            -- Productos aÃ±adidos con existencia 0 de TOMA_FISICA_DET
            SELECT DISTINCT
                tfd.CodProd COLLATE DATABASE_DEFAULT AS CodProd,
                ISNULL(ce.NomProd COLLATE DATABASE_DEFAULT, 'Producto sin nombre') AS NomProd,
                0 AS Existencia
            FROM TOMA_FISICA_DET tfd
            LEFT JOIN CONSULTA_EXISTENCIAS ce 
                ON LTRIM(RTRIM(tfd.CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(ce.CodProd)) COLLATE DATABASE_DEFAULT
            WHERE tfd.Cons = @consecutivo
            AND tfd.Localiz COLLATE DATABASE_DEFAULT = @localizacion COLLATE DATABASE_DEFAULT
            AND tfd.Existencia = 0
            AND tfd.CodProd IS NOT NULL
            AND LTRIM(RTRIM(tfd.CodProd)) <> ''

            ORDER BY CodProd
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener productos:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// 7. Bodega por consecutivo
app.get('/api/bodega/:consecutivo', async (req, res) => {
    try {
        const { consecutivo } = req.params;

        const request = new sql.Request();
        request.input('consecutivo', sql.Int, parseInt(consecutivo));

        const result = await request.query(`
            SELECT DISTINCT DescBodega 
            FROM CONSULTA_TOMA_FISICA_TF_DET 
            WHERE consec = @consecutivo
                AND DescBodega IS NOT NULL 
                AND LTRIM(RTRIM(DescBodega)) <> ''
        `);

        if (result.recordset.length > 0) {
            res.json({ DescBodega: result.recordset[0].DescBodega });
        } else {
            res.json({ DescBodega: 'Bodega no especificada' });
        }
    } catch (err) {
        console.error('Error al obtener bodega:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// 8. Tareas asignadas a un usuario
app.get('/api/tareas/:usuario', async (req, res) => {
    try {
        const { usuario } = req.params;

        const request = new sql.Request();
        request.input('usuario', sql.VarChar, usuario);

        const result = await request.query(`
            SELECT Cons, Localiz, Usuario 
            FROM TOMA_FISICA 
            WHERE Usuario = @usuario
            ORDER BY Cons, Localiz
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener tareas:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.get('/api/obtener-conteos/:consecutivo/:localizacion', async (req, res) => {
    try {
        const { consecutivo, localizacion } = req.params;

        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));
        request.input('localiz', sql.VarChar, localizacion);

        const result = await request.query(`
            SELECT CodProd, Conteo
            FROM TOMA_FISICA_DET
            WHERE Cons = @cons AND Localiz = @localiz
                AND Conteo IS NOT NULL
                AND CodProd IS NOT NULL
                AND LTRIM(RTRIM(CodProd)) <> ''
        `);

        // Convertir array a objeto { CodProd: Conteo }
        const conteos = {};
        result.recordset.forEach(row => {
            conteos[row.CodProd] = row.Conteo || 0;
        });
        res.json(conteos);
    } catch (err) {
        console.error('âŒ Error al obtener conteos:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.get('/api/obtener-reconteos/:consecutivo/:localizacion', async (req, res) => {
    try {
        const { consecutivo, localizacion } = req.params;

        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));
        request.input('localiz', sql.VarChar, localizacion);

        const result = await request.query(`
            SELECT CodProd, Reconteo
            FROM TOMA_FISICA_DET
            WHERE Cons = @cons 
                AND Localiz = @localiz
                AND Reconteo IS NOT NULL
                AND CodProd IS NOT NULL
                AND LTRIM(RTRIM(CodProd)) <> ''
        `);

        // Convertir array a objeto { CodProd: Reconteo }
        const reconteos = {};
        result.recordset.forEach(row => {
            reconteos[row.CodProd] = row.Reconteo || 0;
        });

        res.json(reconteos);
    } catch (err) {
        console.error('âŒ Error al obtener reconteos:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.post('/api/inicializar-reconteo', async (req, res) => {
    try {
        const { consecutivo, localizacion, productos } = req.body;

        if (!consecutivo || !localizacion || !productos || !productos.length) {
            return res.status(400).json({ success: false, message: 'Datos incompletos' });
        }

        for (const p of productos) {
            const request = new sql.Request();

            request.input('cons', sql.Int, consecutivo);
            request.input('localiz', sql.VarChar, localizacion);
            request.input('codProd', sql.VarChar, p.CodProd);

            // Solo actualizar Reconteo a 0 si el registro ya existe
            await request.query(`
                UPDATE TOMA_FISICA_DET
                SET Reconteo = 0
                WHERE Cons = @cons 
                    AND Localiz = @localiz 
                    AND CodProd = @codProd
                    AND Reconteo IS NULL
            `);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('âŒ Error al inicializar reconteo:', err);
        res.status(500).json({ success: false, message: 'Error interno', error: err.message });
    }
});

app.post('/api/inicializar-conteo', async (req, res) => {
    try {
        const { consecutivo, localizacion, productos } = req.body;

        if (!consecutivo || !localizacion || !productos || !productos.length) {
            return res.status(400).json({ success: false, message: 'Datos incompletos' });
        }

        for (const p of productos) {
            const request = new sql.Request(); // ðŸ‘ˆ NUEVO request por cada producto

            request.input('cons', sql.Int, consecutivo);
            request.input('localiz', sql.VarChar, localizacion);
            request.input('codProd', sql.VarChar, p.CodProd);
            request.input('existencia', sql.Decimal(18, 2), p.Existencia || 0);
            request.input('conteo', sql.Decimal(18, 2), 0);

            await request.query(`
                MERGE TOMA_FISICA_DET AS target
                USING (SELECT @cons AS Cons, @localiz AS Localiz, @codProd AS CodProd) AS source
                ON target.Cons = source.Cons AND target.Localiz = source.Localiz AND target.CodProd = source.CodProd
                WHEN NOT MATCHED THEN
                    INSERT (Cons, Localiz, CodProd, Existencia, Conteo, Reconteo)
                    VALUES (@cons, @localiz, @codProd, @existencia, @conteo, 0);
            `);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error al inicializar conteo:', err);
        res.status(500).json({ success: false, message: 'Error interno', error: err.message });
    }
});


// RUTA NUEVA 2: Actualizar o insertar conteo individual (UPSERT)
app.post('/api/actualizar-conteo', async (req, res) => {
    try {
        const { cons, localiz, codProd, conteo } = req.body;

        if (!cons || !localiz || !codProd || conteo === undefined) {
            return res.status(400).json({
                error: 'Todos los campos son requeridos',
                received: { cons, localiz, codProd, conteo }
            });
        }

        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // 1. Obtener la existencia desde CONSULTA_TOMA_FISICA_TF_DET
            const existRequest = new sql.Request(transaction);
            existRequest.input('cons', sql.Int, parseInt(cons));
            existRequest.input('localiz', sql.VarChar, localiz);
            existRequest.input('codProd', sql.VarChar, codProd);

            const existResult = await existRequest.query(`
                SELECT TOP 1 Exist 
                FROM CONSULTA_TOMA_FISICA_TF_DET 
                WHERE consec = @cons AND CodLocaliz = @localiz AND CodProd = @codProd
            `);

            const existencia = existResult.recordset[0]?.Exist || 0;

            // 2. Verificar si ya existe un registro en TOMA_FISICA_DET
            const checkRequest = new sql.Request(transaction);
            checkRequest.input('cons', sql.Int, parseInt(cons));
            checkRequest.input('localiz', sql.VarChar, localiz);
            checkRequest.input('codProd', sql.VarChar, codProd);

            const checkResult = await checkRequest.query(`
                SELECT COUNT(*) as count 
                FROM TOMA_FISICA_DET 
                WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
            `);

            const exists = checkResult.recordset[0].count > 0;

            // 3. UPDATE o INSERT segÃºn corresponda
            if (exists) {
                // Actualizar registro existente
                const updateRequest = new sql.Request(transaction);
                updateRequest.input('cons', sql.Int, parseInt(cons));
                updateRequest.input('localiz', sql.VarChar, localiz);
                updateRequest.input('codProd', sql.VarChar, codProd);
                updateRequest.input('conteo', sql.Int, parseInt(conteo));
                updateRequest.input('existencia', sql.Int, existencia);

                await updateRequest.query(`
                    UPDATE TOMA_FISICA_DET 
                    SET Conteo = @conteo, 
                        Existencia = @existencia
                    WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
                `);

            } else {
                // Insertar nuevo registro
                const insertRequest = new sql.Request(transaction);
                insertRequest.input('cons', sql.Int, parseInt(cons));
                insertRequest.input('localiz', sql.VarChar, localiz);
                insertRequest.input('codProd', sql.VarChar, codProd);
                insertRequest.input('conteo', sql.Int, parseInt(conteo));
                insertRequest.input('existencia', sql.Int, existencia);

                await insertRequest.query(`
                    INSERT INTO TOMA_FISICA_DET (Cons, Localiz, CodProd, Conteo, Existencia) 
                    VALUES (@cons, @localiz, @codProd, @conteo, @existencia)
                `);

            }

            await transaction.commit();
            res.json({
                success: true,
                message: 'Conteo guardado correctamente',
                action: exists ? 'updated' : 'inserted'
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Error al actualizar conteo:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});

// RUTA NUEVA 3: Finalizar tarea (opcional, para cuando el trabajador termine)
app.post('/api/finalizar-tarea', async (req, res) => {
    try {
        const { cons, localiz } = req.body;

        if (!cons || !localiz) {
            return res.status(400).json({ error: 'Consecutivo y localizaciÃ³n son requeridos' });
        }


        // AquÃ­ puedes agregar lÃ³gica adicional si necesitas marcar la tarea como completada
        // Por ahora solo confirmamos que todos los datos estÃ¡n guardados

        res.json({
            success: true,
            message: 'Tarea finalizada correctamente'
        });
    } catch (err) {
        console.error('Error al finalizar tarea:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});

app.post('/api/subir-conteo-parcial', async (req, res) => {
    try {
        const { task, counts } = req.body;

        if (!task || !counts) {
            return res.status(400).json({ error: 'Task y counts son requeridos' });
        }


        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            for (const [codProd, conteo] of Object.entries(counts)) {
                // Obtener existencia desde CONSULTA_TOMA_FISICA_TF_DET
                const request = new sql.Request(transaction);
                request.input('cons', sql.Int, parseInt(task.Cons));
                request.input('localiz', sql.VarChar, task.Localiz);
                request.input('codProd', sql.VarChar, codProd);

                const existResult = await request.query(`
                    SELECT TOP 1 Exist 
                    FROM CONSULTA_TOMA_FISICA_TF_DET 
                    WHERE consec = @cons AND CodLocaliz = @localiz AND CodProd = @codProd
                `);

                const existencia = existResult.recordset[0]?.Exist || 0;

                // Verificar si ya existe un registro para este producto
                const checkRequest = new sql.Request(transaction);
                checkRequest.input('cons', sql.Int, parseInt(task.Cons));
                checkRequest.input('localiz', sql.VarChar, task.Localiz);
                checkRequest.input('codProd', sql.VarChar, codProd);

                const checkResult = await checkRequest.query(`
                    SELECT COUNT(*) as count 
                    FROM TOMA_FISICA_DET 
                    WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
                `);

                if (checkResult.recordset[0].count > 0) {
                    // Actualizar registro existente
                    const updateRequest = new sql.Request(transaction);
                    updateRequest.input('cons', sql.Int, parseInt(task.Cons));
                    updateRequest.input('localiz', sql.VarChar, task.Localiz);
                    updateRequest.input('codProd', sql.VarChar, codProd);
                    updateRequest.input('conteo', sql.Int, parseInt(conteo));
                    updateRequest.input('existencia', sql.Int, existencia);

                    await updateRequest.query(`
                        UPDATE TOMA_FISICA_DET 
                        SET Conteo = @conteo, Existencia = @existencia
                        WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
                    `);

                } else {
                    // Insertar nuevo registro
                    const insertRequest = new sql.Request(transaction);
                    insertRequest.input('cons', sql.Int, parseInt(task.Cons));
                    insertRequest.input('localiz', sql.VarChar, task.Localiz);
                    insertRequest.input('codProd', sql.VarChar, codProd);
                    insertRequest.input('conteo', sql.Int, parseInt(conteo));
                    insertRequest.input('existencia', sql.Int, existencia);

                    await insertRequest.query(`
                        INSERT INTO TOMA_FISICA_DET (Cons, Localiz, CodProd, Conteo, Existencia) 
                        VALUES (@cons, @localiz, @codProd, @conteo, @existencia)
                    `);

                }
            }

            await transaction.commit();
            res.json({ success: true, message: 'Conteo parcial guardado correctamente' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Error al subir conteo parcial:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// Ruta para subir conteo (y eliminar tarea completada SOLO de la vista del trabajador)
app.post('/api/subir-conteo', async (req, res) => {
    try {
        const { task, counts } = req.body;

        if (!task || !counts) {
            return res.status(400).json({ error: 'Task y counts son requeridos' });
        }


        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // Procesar cada conteo individualmente
            for (const [codProd, conteo] of Object.entries(counts)) {
                try {
                    // Obtener existencia desde CONSULTA_TOMA_FISICA_TF_DET
                    const request = new sql.Request(transaction);
                    request.input('cons', sql.Int, parseInt(task.Cons));
                    request.input('localiz', sql.VarChar, task.Localiz);
                    request.input('codProd', sql.VarChar, codProd);

                    const existResult = await request.query(`
                        SELECT TOP 1 Exist 
                        FROM CONSULTA_TOMA_FISICA_TF_DET 
                        WHERE consec = @cons AND CodLocaliz = @localiz AND CodProd = @codProd
                    `);

                    const existencia = existResult.recordset[0]?.Exist || 0;

                    // Verificar si ya existe un registro para este producto
                    const checkRequest = new sql.Request(transaction);
                    checkRequest.input('cons', sql.Int, parseInt(task.Cons));
                    checkRequest.input('localiz', sql.VarChar, task.Localiz);
                    checkRequest.input('codProd', sql.VarChar, codProd);

                    const checkResult = await checkRequest.query(`
                        SELECT COUNT(*) as count 
                        FROM TOMA_FISICA_DET 
                        WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
                    `);

                    if (checkResult.recordset[0].count > 0) {
                        // Actualizar registro existente
                        const updateRequest = new sql.Request(transaction);
                        updateRequest.input('cons', sql.Int, parseInt(task.Cons));
                        updateRequest.input('localiz', sql.VarChar, task.Localiz);
                        updateRequest.input('codProd', sql.VarChar, codProd);
                        updateRequest.input('conteo', sql.Int, parseInt(conteo));
                        updateRequest.input('existencia', sql.Int, existencia);

                        await updateRequest.query(`
                            UPDATE TOMA_FISICA_DET 
                            SET Conteo = @conteo, Existencia = @existencia
                            WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
                        `);

                    } else {
                        // Insertar nuevo registro
                        const insertRequest = new sql.Request(transaction);
                        insertRequest.input('cons', sql.Int, parseInt(task.Cons));
                        insertRequest.input('localiz', sql.VarChar, task.Localiz);
                        insertRequest.input('codProd', sql.VarChar, codProd);
                        insertRequest.input('conteo', sql.Int, parseInt(conteo));
                        insertRequest.input('existencia', sql.Int, existencia);

                        await insertRequest.query(`
                            INSERT INTO TOMA_FISICA_DET (Cons, Localiz, CodProd, Conteo, Existencia) 
                            VALUES (@cons, @localiz, @codProd, @conteo, @existencia)
                        `);

                    }
                } catch (err) {
                    console.error(`Error al procesar producto ${codProd}:`, err);
                    // Continuar con los demÃ¡s productos
                }
            }

            // NO eliminamos de TOMA_FISICA - solo marcamos como completada en la vista del trabajador
            // La eliminaciÃ³n de TOMA_FISICA la hace el administrador

            await transaction.commit();
            res.json({ success: true, message: 'Conteo subido exitosamente a la base de datos' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Error al subir conteo:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.get('/api/buscar-producto/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;

        const request = new sql.Request();
        request.input('codigo', sql.VarChar, codigo);

        const result = await request.query(`
            SELECT TOP 1 consec, CodLocaliz, DescBodega, NomProd
            FROM CONSULTA_TOMA_FISICA_TF_DET
            WHERE CodProd = @codigo
                AND consec IS NOT NULL 
                AND CodLocaliz IS NOT NULL 
                AND DescBodega IS NOT NULL 
                AND NomProd IS NOT NULL
        `);

        if (result.recordset.length > 0) {
            const producto = result.recordset[0];
            res.json({
                encontrado: true,
                consec: producto.consec,
                localizacion: producto.CodLocaliz,
                bodega: producto.DescBodega,
                nombre: producto.NomProd
            });
        } else {
            res.json({
                encontrado: false,
                mensaje: 'Producto no encontrado en ninguna localizaciÃ³n'
            });
        }
    } catch (err) {
        console.error('Error al buscar producto:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// --- NUEVA RUTA PARA LA VISTA DE ADMINISTRADOR ACTUALIZADA ---
// Ruta para obtener tareas asignadas por consecutivo (NUEVA LÃ“GICA MEJORADA)
app.get('/api/tareas-asignadas/:consecutivo', async (req, res) => {
    try {
        const { consecutivo } = req.params;
        const consecInt = parseInt(consecutivo);

        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // Verificar si ya existen asignaciones para este consecutivo
            const checkRequest = new sql.Request(transaction);
            checkRequest.input('cons', sql.Int, consecInt);

            const checkResult = await checkRequest.query(`
                SELECT COUNT(*) as count 
                FROM TOMA_FISICA 
                WHERE Cons = @cons
            `);

            const asignacionesExistentes = checkResult.recordset[0].count > 0;

            if (!asignacionesExistentes) {
                // Obtener todas las localizaciones posibles para el consecutivo
                const localizacionesRequest = new sql.Request(transaction);
                localizacionesRequest.input('cons', sql.Int, consecInt);

                const localizacionesResult = await localizacionesRequest.query(`
                    SELECT DISTINCT tfd.CodLocaliz, tfd.DescBodega
                    FROM CONSULTA_TOMA_FISICA_TF_DET tfd
                    WHERE tfd.consec = @cons
                        AND tfd.CodLocaliz IS NOT NULL 
                        AND LTRIM(RTRIM(tfd.CodLocaliz)) <> ''
                        AND tfd.DescBodega IS NOT NULL 
                        AND LTRIM(RTRIM(tfd.DescBodega)) <> ''
                    ORDER BY tfd.DescBodega, tfd.CodLocaliz
                `);

                // Insertar registros iniciales con NULL (Sin Asignar)
                for (const loc of localizacionesResult.recordset) {
                    const insertRequest = new sql.Request(transaction);
                    insertRequest.input('cons', sql.Int, consecInt);
                    insertRequest.input('localiz', sql.VarChar, loc.CodLocaliz);

                    await insertRequest.query(`
                        INSERT INTO TOMA_FISICA (Cons, Localiz, Usuario) 
                        VALUES (@cons, @localiz, NULL)
                    `);
                }

            }

            // Obtener todas las localizaciones con sus datos y asignaciones
            // CORRECCIÃ“N: Usar COLLATE DATABASE_DEFAULT para resolver conflictos de collation
            const request = new sql.Request(transaction);
            request.input('cons', sql.Int, consecInt);

            const result = await request.query(`
                SELECT 
                    tfd.CodLocaliz,
                    tfd.DescBodega,
                    tf.Usuario
                FROM CONSULTA_TOMA_FISICA_TF_DET tfd
                LEFT JOIN TOMA_FISICA tf ON tf.Cons = tfd.consec 
                    AND tf.Localiz COLLATE DATABASE_DEFAULT = tfd.CodLocaliz COLLATE DATABASE_DEFAULT
                WHERE tfd.consec = @cons
                    AND tfd.CodLocaliz IS NOT NULL 
                    AND LTRIM(RTRIM(tfd.CodLocaliz)) <> ''
                    AND tfd.DescBodega IS NOT NULL 
                    AND LTRIM(RTRIM(tfd.DescBodega)) <> ''
                GROUP BY tfd.CodLocaliz, tfd.DescBodega, tf.Usuario
                ORDER BY tfd.DescBodega, tfd.CodLocaliz
            `);

            await transaction.commit();

            // Formatear los datos para el frontend
            const localizaciones = result.recordset.map(row => ({
                CodLocaliz: row.CodLocaliz,
                DescBodega: row.DescBodega,
                Usuario: row.Usuario || null
            }));

            res.json(localizaciones);
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Error al obtener tareas asignadas:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// Ruta para asignar localizaciÃ³n (actualizada para manejar correctamente NULL)
app.put('/api/asignar-localizacion', async (req, res) => {
    try {
        const { consecutivo, localizacion, usuario } = req.body;

        if (!consecutivo || !localizacion) {
            return res.status(400).json({ error: 'Consecutivo y localizaciÃ³n son requeridos' });
        }

        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));
        request.input('localiz', sql.VarChar, localizacion);

        // Primero eliminar cualquier asignaciÃ³n anterior para esta localizaciÃ³n
        // CORRECCIÃ“N: Usar COLLATE DATABASE_DEFAULT para resolver conflictos de collation
        await request.query(`
            DELETE FROM TOMA_FISICA 
            WHERE Cons = @cons 
            AND Localiz COLLATE DATABASE_DEFAULT = @localiz COLLATE DATABASE_DEFAULT
        `);

        // Si se proporciona un usuario, crear nueva asignaciÃ³n
        if (usuario) {
            request.input('usuario', sql.VarChar, usuario);
            await request.query(`
                INSERT INTO TOMA_FISICA (Cons, Localiz, Usuario) 
                VALUES (@cons, @localiz, @usuario)
            `);
        }

        res.json({ success: true, message: 'AsignaciÃ³n actualizada correctamente' });
    } catch (err) {
        console.error('Error al actualizar asignaciÃ³n:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// Ruta para obtener localizaciones posibles por consecutivo
app.get('/api/localizaciones-posibles/:consecutivo', async (req, res) => {
    try {
        const { consecutivo } = req.params;


        const request = new sql.Request();
        request.input('consecutivo', sql.Int, parseInt(consecutivo));

        const result = await request.query(`
            SELECT DISTINCT tfd.CodLocaliz, tfd.DescBodega
            FROM CONSULTA_TOMA_FISICA_TF_DET tfd
            WHERE tfd.consec = @consecutivo
                AND tfd.CodLocaliz IS NOT NULL 
                AND LTRIM(RTRIM(tfd.CodLocaliz)) <> ''
                AND tfd.DescBodega IS NOT NULL 
                AND LTRIM(RTRIM(tfd.DescBodega)) <> ''
            ORDER BY tfd.DescBodega, tfd.CodLocaliz
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener localizaciones posibles:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// Ruta para obtener asignaciones actuales por consecutivo
app.get('/api/asignaciones-actuales/:consecutivo', async (req, res) => {
    try {
        const { consecutivo } = req.params;


        const request = new sql.Request();
        request.input('consecutivo', sql.Int, parseInt(consecutivo));

        const result = await request.query(`
            SELECT Localiz, Usuario
            FROM TOMA_FISICA
            WHERE Cons = @consecutivo
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener asignaciones actuales:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.post('/api/guardar-reconteo', async (req, res) => {
    try {
        const { cons, localiz, codProd, valor } = req.body;
        if (!cons || !localiz || !codProd) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        const request = new sql.Request();
        request.input('cons', sql.Int, cons);
        request.input('localiz', sql.VarChar, localiz);
        request.input('codProd', sql.VarChar, codProd);
        request.input('valor', sql.Decimal(18, 2), valor);

        await request.query(`
            UPDATE TOMA_FISICA_DET
            SET Reconteo = @valor
            WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
        `);

        res.json({ success: true });
    } catch (err) {
        console.error('Error al guardar reconteo:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// Ruta para actualizar asignaciÃ³n (guardar inmediatamente en la base de datos)
app.post('/api/actualizar-asignacion', async (req, res) => {
    try {
        const { consecutivo, localizacion, usuario } = req.body;


        if (!consecutivo || !localizacion) {
            return res.status(400).json({ error: 'Consecutivo y localizaciÃ³n son requeridos' });
        }

        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));
        request.input('localiz', sql.VarChar, localizacion);

        // Primero eliminar cualquier asignaciÃ³n anterior para esta localizaciÃ³n
        await request.query(`
            DELETE FROM TOMA_FISICA 
            WHERE Cons = @cons AND Localiz = @localiz
        `);

        // Si se proporciona un usuario, crear nueva asignaciÃ³n
        if (usuario) {
            request.input('usuario', sql.VarChar, usuario);
            await request.query(`
                INSERT INTO TOMA_FISICA (Cons, Localiz, Usuario) 
                VALUES (@cons, @localiz, @usuario)
            `);
        }

    } catch (err) {
        console.error('Error al actualizar asignaciÃ³n:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// Ruta para actualizar asignaciÃ³n (guardar inmediatamente en la base de datos)

app.post('/api/asignar-multiples-tareas', async (req, res) => {
    try {
        const { consecutivo, asignaciones } = req.body;

        if (!consecutivo || !asignaciones || typeof asignaciones !== 'object') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Consecutivo y asignaciones son requeridos'
            });
        }

        // Usar transacciÃ³n para asegurar consistencia
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {

            // Procesar cada asignaciÃ³n
            for (const [localizacion, usuario] of Object.entries(asignaciones)) {

                const request = new sql.Request(transaction);
                request.input('cons', sql.Int, parseInt(consecutivo));
                request.input('localiz', sql.VarChar, localizacion);
                request.input('usuario', sql.VarChar, usuario);

                // Primero eliminar cualquier asignaciÃ³n existente para esta localizaciÃ³n
                await request.query(`
                    DELETE FROM TOMA_FISICA 
                    WHERE Cons = @cons AND Localiz = @localiz
                `);

                // Insertar nueva asignaciÃ³n
                await request.query(`
                    INSERT INTO TOMA_FISICA (Cons, Localiz, Usuario) 
                    VALUES (@cons, @localiz, @usuario)
                `);
            }

            await transaction.commit();

            res.json({
                success: true,
                message: `Tareas asignadas correctamente a ${Object.keys(asignaciones).length} localizaciones`
            });
        } catch (err) {
            await transaction.rollback();
            console.error('Error en transacciÃ³n de asignaciÃ³n mÃºltiple:', err);
            throw err;
        }
    } catch (err) {
        console.error('Error al asignar mÃºltiples tareas:', err);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Error interno del servidor',
            details: err.message
        });
    }
});

app.get('/api/verificar-ubicacion-producto/:bodega/:localizacion/:codigo', async (req, res) => {
    try {
        const { bodega, localizacion, codigo } = req.params;
        console.log('ðŸ” Verificando producto:', { bodega, localizacion, codigo });

        // Rellenar el cÃ³digo de producto con ceros a la izquierda hasta 15 dÃ­gitos
        const codigoPadded = codigo.trim().padStart(15, '0');
        console.log('ðŸ“ CÃ³digo con padding:', codigoPadded);

        const request = new sql.Request();
        request.input('bod', sql.VarChar, bodega.trim());
        request.input('localiz', sql.VarChar, localizacion.trim());
        request.input('prod', sql.VarChar, codigoPadded);

        // PASO 0: Debug - Buscar el producto sin filtro de bodega
        const debugQuery = `
            SELECT TOP 5 
                CodBodega, 
                CodProd, 
                Ubicacion,
                Existencia,
                LEN(LTRIM(RTRIM(CodBodega))) as LenBodega,
                LEN(LTRIM(RTRIM(CodProd))) as LenProd,
                LEN(LTRIM(RTRIM(Ubicacion))) as LenUbic
            FROM CONSULTA_EXISTENCIAS
            WHERE LTRIM(RTRIM(CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(@prod)) COLLATE DATABASE_DEFAULT
        `;

        const debugResult = await request.query(debugQuery);
        console.log('ðŸ” Debug - Buscando producto sin filtro de bodega:', debugResult.recordset);

        // PASO 1: Buscar el producto en CONSULTA_EXISTENCIAS filtrando por BODEGA y CÃ“DIGO
        // IMPORTANTE: Ahora tambiÃ©n traemos la Existencia
        const queryExistencias = `
            SELECT TOP 1 
                LTRIM(RTRIM(CodBodega)) as CodBodega, 
                LTRIM(RTRIM(Ubicacion)) as Ubicacion, 
                LTRIM(RTRIM(CodProd)) as CodProd,
                ISNULL(Existencia, 0) as Existencia
            FROM CONSULTA_EXISTENCIAS
            WHERE LTRIM(RTRIM(CodBodega)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(@bod)) COLLATE DATABASE_DEFAULT
              AND LTRIM(RTRIM(CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(@prod)) COLLATE DATABASE_DEFAULT
        `;

        const resultExistencias = await request.query(queryExistencias);
        console.log('ðŸ“Š Resultado en CONSULTA_EXISTENCIAS (con bodega):', resultExistencias.recordset);

        // Si no encuentra con la bodega exacta, buscar solo por producto
        if (resultExistencias.recordset.length === 0) {
            console.log('âš ï¸ No se encontrÃ³ con bodega, buscando solo por cÃ³digo de producto...');

            const queryProductoSolo = `
                SELECT TOP 1 
                    LTRIM(RTRIM(CodBodega)) as CodBodega, 
                    LTRIM(RTRIM(Ubicacion)) as Ubicacion, 
                    LTRIM(RTRIM(CodProd)) as CodProd,
                    ISNULL(Existencia, 0) as Existencia
                FROM CONSULTA_EXISTENCIAS
                WHERE LTRIM(RTRIM(CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(@prod)) COLLATE DATABASE_DEFAULT
            `;

            const resultProductoSolo = await request.query(queryProductoSolo);
            console.log('ðŸ“Š Resultado buscando solo producto:', resultProductoSolo.recordset);

            // ESCENARIO #3: Producto NO existe en ninguna bodega
            if (resultProductoSolo.recordset.length === 0) {
                return res.json({
                    encontrado: false,
                    ubicacionCorrecta: false,
                    mensaje: 'âŒ Este producto no estÃ¡ registrado en la base de datos. Por favor, solicitar ayuda.'
                });
            }

            // El producto existe pero en otra bodega
            const productoOtraBodega = resultProductoSolo.recordset[0];
            const ubicacionReal = productoOtraBodega.Ubicacion || '';
            const bodegaReal = productoOtraBodega.CodBodega || '';

            return res.json({
                encontrado: true,
                ubicacionCorrecta: false,
                mensaje: `âš ï¸ Este producto pertenece a la bodega "${bodegaReal}", ubicaciÃ³n "${ubicacionReal}"`,
                ubicacionReal: ubicacionReal,
                bodegaReal: bodegaReal
            });
        }

        // El producto existe en esta bodega, obtener su ubicaciÃ³n real y existencia
        const productoExistencia = resultExistencias.recordset[0];
        const ubicacionReal = productoExistencia.Ubicacion || '';
        const bodegaReal = productoExistencia.CodBodega || '';
        const existencia = productoExistencia.Existencia || 0;



        // PASO 2: Verificar si el producto estÃ¡ en la localizaciÃ³n correcta
        const ubicacionCoincide = ubicacionReal === localizacion;

        // Si no estÃ¡ en la ubicaciÃ³n correcta
        if (!ubicacionCoincide) {
            // ESCENARIO #2: Producto existe en esta bodega pero estÃ¡ en otra localizaciÃ³n
            return res.json({
                encontrado: true,
                ubicacionCorrecta: false,
                mensaje: `âš ï¸ Este producto pertenece a la ubicaciÃ³n "${ubicacionReal}"`,
                ubicacionReal: ubicacionReal,
                bodegaReal: bodegaReal
            });
        }

        // La ubicaciÃ³n es correcta, ahora verificar la existencia
        if (existencia === 0) {
            // ESCENARIO #4: Producto en ubicaciÃ³n correcta PERO con Existencia = 0
            return res.json({
                encontrado: true,
                ubicacionCorrecta: true,
                existenciaCero: true,
                mensaje: 'âš ï¸ Este producto tiene existencia 0 en el sistema. Â¿Desea agregarlo al conteo?',
                codigo: codigoPadded,
                ubicacion: ubicacionReal,
                bodega: bodegaReal
            });
        }

        // ESCENARIO #1: Producto en ubicaciÃ³n correcta con existencia > 0
        return res.json({
            encontrado: true,
            ubicacionCorrecta: true,
            existenciaCero: false,
            mensaje: 'âœ… Producto encontrado en la ubicaciÃ³n correcta',
            codigo: codigoPadded
        });

    } catch (err) {
        console.error('âŒ Error al verificar ubicaciÃ³n del producto:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});

// ðŸ†• RUTA PARA AÃ‘ADIR PRODUCTO CON EXISTENCIA 0
// ðŸ†• RUTA PARA AÃ‘ADIR PRODUCTO CON EXISTENCIA 0
app.post('/api/anadir-producto-existencia-cero', async (req, res) => {
    try {
        const { cons, localiz, codProd, esReconteo } = req.body; // âœ… Nuevo parÃ¡metro

        if (!cons || !localiz || !codProd) {
            return res.status(400).json({
                error: 'Todos los campos son requeridos',
                received: { cons, localiz, codProd }
            });
        }

        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // Verificar si ya existe en TOMA_FISICA_DET
            const checkRequest = new sql.Request(transaction);
            checkRequest.input('cons', sql.Int, parseInt(cons));
            checkRequest.input('localiz', sql.VarChar, localiz);
            checkRequest.input('codProd', sql.VarChar, codProd);

            const checkResult = await checkRequest.query(`
                SELECT COUNT(*) as count 
                FROM TOMA_FISICA_DET 
                WHERE Cons = @cons 
                  AND Localiz COLLATE DATABASE_DEFAULT = @localiz COLLATE DATABASE_DEFAULT
                  AND CodProd COLLATE DATABASE_DEFAULT = @codProd COLLATE DATABASE_DEFAULT
            `);

            if (checkResult.recordset[0].count > 0) {
                await transaction.rollback();
                return res.json({
                    success: false,
                    message: 'Este producto ya existe en el conteo'
                });
            }

            // Obtener el nombre del producto desde CONSULTA_EXISTENCIAS
            const productInfoRequest = new sql.Request(transaction);
            productInfoRequest.input('codProd', sql.VarChar, codProd);

            const productInfoResult = await productInfoRequest.query(`
                SELECT TOP 1 
                    LTRIM(RTRIM(CodProd)) as CodProd,
                    NomProd
                FROM CONSULTA_EXISTENCIAS
                WHERE LTRIM(RTRIM(CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(@codProd)) COLLATE DATABASE_DEFAULT
            `);

            const nombreProducto = productInfoResult.recordset.length > 0
                ? productInfoResult.recordset[0].NomProd
                : 'Producto sin nombre';

            // âœ… CAMBIO CLAVE: Insertar con Conteo=1 o Reconteo=1 segÃºn corresponda
            const insertRequest = new sql.Request(transaction);
            insertRequest.input('cons', sql.Int, parseInt(cons));
            insertRequest.input('localiz', sql.VarChar, localiz);
            insertRequest.input('codProd', sql.VarChar, codProd);
            insertRequest.input('existencia', sql.Int, 0);

            if (esReconteo) {
                // Si es reconteo: Conteo=0, Reconteo=1
                insertRequest.input('conteo', sql.Int, 0);
                insertRequest.input('reconteo', sql.Int, 1);
            } else {
                // Si es conteo: Conteo=1, Reconteo=0
                insertRequest.input('conteo', sql.Int, 1);
                insertRequest.input('reconteo', sql.Int, 0);
            }

            await insertRequest.query(`
                INSERT INTO TOMA_FISICA_DET (Cons, Localiz, CodProd, Existencia, Conteo, Reconteo) 
                VALUES (@cons, @localiz, @codProd, @existencia, @conteo, @reconteo)
            `);

            await transaction.commit();
            console.log('âœ… Producto aÃ±adido exitosamente');

            res.json({
                success: true,
                message: 'Producto aÃ±adido al ' + (esReconteo ? 'reconteo' : 'conteo') + ' exitosamente',
                producto: {
                    CodProd: codProd,
                    NomProd: nombreProducto,
                    Existencia: 0,
                    Conteo: esReconteo ? 0 : 1,
                    Reconteo: esReconteo ? 1 : 0
                }
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) {
        console.error('âŒ Error al aÃ±adir producto con existencia 0:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});

// --- AÃ‘ADIR ESTA RUTA EN server.js ---
app.get('/api/codbod-por-consecutivo/:consecutivo', async (req, res) => {
    try {
        const { consecutivo } = req.params;
        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));

        // Buscar un CodBod en CONSULTA_TOMA_FISICA_TF_DET para el consecutivo dado
        // Tomamos el primer CodBod distinto de nulo que encontremos para ese consecutivo
        const result = await request.query(`
            SELECT DISTINCT TOP 1 CodBod
            FROM CONSULTA_TOMA_FISICA_TF_DET
            WHERE consec = @cons
              AND CodBod IS NOT NULL
              AND LTRIM(RTRIM(CodBod)) <> ''
        `);

        if (result.recordset.length > 0) {
            const codBod = result.recordset[0].CodBod.trim(); // Limpiar espacios
            res.json({
                encontrado: true,
                codBod: codBod
            });
        } else {
            res.json({
                encontrado: false,
                mensaje: 'No se encontrÃ³ el cÃ³digo de bodega para este consecutivo.'
            });
        }
    } catch (err) {
        console.error('âŒ Error al obtener CodBod por consecutivo:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// ðŸ” RUTA DE DIAGNÃ“STICO - Temporal para verificar estructura de datos
app.get('/api/diagnostico/:consecutivo/:codigo', async (req, res) => {
    try {
        const { consecutivo, codigo } = req.params;
        console.log('ðŸ” DIAGNÃ“STICO - Consecutivo:', consecutivo, 'CÃ³digo:', codigo);

        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));
        request.input('cod', sql.VarChar, codigo.trim());

        // 1. InformaciÃ³n de CONSULTA_TOMA_FISICA_TF_DET
        const queryTomaFisica = `
            SELECT TOP 5
                consec,
                CodBod,
                CodLocaliz,
                CodProd,
                NomProd,
                DescBodega,
                LEN(CodBod) as LenCodBod,
                LEN(CodLocaliz) as LenCodLocaliz,
                LEN(CodProd) as LenCodProd
            FROM CONSULTA_TOMA_FISICA_TF_DET
            WHERE consec = @cons
            ORDER BY CodLocaliz, CodProd
        `;

        const resultTomaFisica = await request.query(queryTomaFisica);

        // 2. InformaciÃ³n de CONSULTA_EXISTENCIAS - Buscar el producto especÃ­fico
        const queryExistenciaProducto = `
            SELECT TOP 10
                CodBodega,
                CodProd,
                Ubicacion,
                LEN(CodBodega) as LenCodBodega,
                LEN(CodProd) as LenCodProd,
                LEN(Ubicacion) as LenUbicacion,
                DATALENGTH(CodBodega) as DataLenCodBodega,
                DATALENGTH(CodProd) as DataLenCodProd,
                DATALENGTH(Ubicacion) as DataLenUbicacion
            FROM CONSULTA_EXISTENCIAS
            WHERE CodProd COLLATE DATABASE_DEFAULT LIKE '%' + @cod + '%'
               OR LTRIM(RTRIM(CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(@cod)) COLLATE DATABASE_DEFAULT
        `;

        const resultExistenciaProducto = await request.query(queryExistenciaProducto);

        // 3. InformaciÃ³n general de CONSULTA_EXISTENCIAS (primeros registros)
        const queryExistenciaGeneral = `
            SELECT TOP 10
                CodBodega,
                CodProd,
                Ubicacion,
                LEN(CodBodega) as LenCodBodega,
                LEN(CodProd) as LenCodProd,
                LEN(Ubicacion) as LenUbicacion
            FROM CONSULTA_EXISTENCIAS
            ORDER BY CodBodega, CodProd
        `;

        const resultExistenciaGeneral = await request.query(queryExistenciaGeneral);

        // 4. Obtener CodBod del consecutivo
        const queryCodBod = `
            SELECT DISTINCT TOP 1 
                CodBod,
                LEN(CodBod) as LenCodBod,
                DATALENGTH(CodBod) as DataLenCodBod
            FROM CONSULTA_TOMA_FISICA_TF_DET
            WHERE consec = @cons
              AND CodBod IS NOT NULL
              AND LTRIM(RTRIM(CodBod)) <> ''
        `;

        const resultCodBod = await request.query(queryCodBod);

        // 5. Contar registros en ambas tablas
        const queryCounts = `
            SELECT 
                (SELECT COUNT(*) FROM CONSULTA_TOMA_FISICA_TF_DET WHERE consec = @cons) as CountTomaFisica,
                (SELECT COUNT(*) FROM CONSULTA_EXISTENCIAS) as CountExistencias
        `;

        const resultCounts = await request.query(queryCounts);

        // 6. Buscar coincidencias entre ambas tablas (CON COLLATE)
        const queryCoincidencias = `
            SELECT TOP 5
                tf.CodBod as TF_CodBod,
                tf.CodLocaliz as TF_CodLocaliz,
                tf.CodProd as TF_CodProd,
                ex.CodBodega as EX_CodBodega,
                ex.Ubicacion as EX_Ubicacion,
                ex.CodProd as EX_CodProd,
                CASE 
                    WHEN LTRIM(RTRIM(tf.CodBod)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(ex.CodBodega)) COLLATE DATABASE_DEFAULT THEN 'MATCH' 
                    ELSE 'NO MATCH' 
                END as BodegaMatch,
                CASE 
                    WHEN LTRIM(RTRIM(tf.CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(ex.CodProd)) COLLATE DATABASE_DEFAULT THEN 'MATCH' 
                    ELSE 'NO MATCH' 
                END as ProductoMatch
            FROM CONSULTA_TOMA_FISICA_TF_DET tf
            LEFT JOIN CONSULTA_EXISTENCIAS ex 
                ON LTRIM(RTRIM(tf.CodProd)) COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(ex.CodProd)) COLLATE DATABASE_DEFAULT
            WHERE tf.consec = @cons
            ORDER BY tf.CodProd
        `;

        const resultCoincidencias = await request.query(queryCoincidencias);

        // Construir respuesta de diagnÃ³stico
        const diagnostico = {
            resumen: {
                consecutivo: consecutivo,
                codigoProductoBuscado: codigo,
                totalRegistrosTomaFisica: resultCounts.recordset[0].CountTomaFisica,
                totalRegistrosExistencias: resultCounts.recordset[0].CountExistencias
            },
            codBodDelConsecutivo: resultCodBod.recordset.length > 0 ? {
                valor: resultCodBod.recordset[0].CodBod,
                valorLimpio: resultCodBod.recordset[0].CodBod?.trim(),
                longitud: resultCodBod.recordset[0].LenCodBod,
                dataLength: resultCodBod.recordset[0].DataLenCodBod
            } : 'No encontrado',
            datosTomaFisica: {
                mensaje: 'Primeros 5 registros del consecutivo en CONSULTA_TOMA_FISICA_TF_DET',
                registros: resultTomaFisica.recordset.map(r => ({
                    consec: r.consec,
                    CodBod: r.CodBod,
                    CodBodLimpio: r.CodBod?.trim(),
                    LenCodBod: r.LenCodBod,
                    CodLocaliz: r.CodLocaliz,
                    CodLocalizLimpio: r.CodLocaliz?.trim(),
                    LenCodLocaliz: r.LenCodLocaliz,
                    CodProd: r.CodProd,
                    CodProdLimpio: r.CodProd?.trim(),
                    LenCodProd: r.LenCodProd,
                    NomProd: r.NomProd ? r.NomProd.substring(0, 30) + '...' : 'N/A',
                    DescBodega: r.DescBodega
                }))
            },
            datosExistenciasProductoEspecifico: {
                mensaje: 'BÃºsqueda del producto especÃ­fico en CONSULTA_EXISTENCIAS',
                encontrados: resultExistenciaProducto.recordset.length,
                registros: resultExistenciaProducto.recordset.map(r => ({
                    CodBodega: r.CodBodega,
                    CodBodegaLimpio: r.CodBodega?.trim(),
                    LenCodBodega: r.LenCodBodega,
                    DataLenCodBodega: r.DataLenCodBodega,
                    CodProd: r.CodProd,
                    CodProdLimpio: r.CodProd?.trim(),
                    LenCodProd: r.LenCodProd,
                    DataLenCodProd: r.DataLenCodProd,
                    Ubicacion: r.Ubicacion,
                    UbicacionLimpia: r.Ubicacion?.trim(),
                    LenUbicacion: r.LenUbicacion,
                    DataLenUbicacion: r.DataLenUbicacion
                }))
            },
            datosExistenciasGeneral: {
                mensaje: 'Primeros 10 registros de CONSULTA_EXISTENCIAS (muestra general)',
                registros: resultExistenciaGeneral.recordset.map(r => ({
                    CodBodega: r.CodBodega,
                    CodBodegaLimpio: r.CodBodega?.trim(),
                    LenCodBodega: r.LenCodBodega,
                    CodProd: r.CodProd,
                    CodProdLimpio: r.CodProd?.trim(),
                    LenCodProd: r.LenCodProd,
                    Ubicacion: r.Ubicacion,
                    UbicacionLimpia: r.Ubicacion?.trim(),
                    LenUbicacion: r.LenUbicacion
                }))
            },
            coincidenciasEntreTablas: {
                mensaje: 'Coincidencias entre CONSULTA_TOMA_FISICA_TF_DET y CONSULTA_EXISTENCIAS',
                registros: resultCoincidencias.recordset.map(r => ({
                    TomaFisica: {
                        CodBod: r.TF_CodBod,
                        CodBodLimpio: r.TF_CodBod?.trim(),
                        CodLocaliz: r.TF_CodLocaliz,
                        CodLocalizLimpio: r.TF_CodLocaliz?.trim(),
                        CodProd: r.TF_CodProd,
                        CodProdLimpio: r.TF_CodProd?.trim()
                    },
                    Existencias: {
                        CodBodega: r.EX_CodBodega,
                        CodBodegaLimpio: r.EX_CodBodega?.trim(),
                        Ubicacion: r.EX_Ubicacion,
                        UbicacionLimpia: r.EX_Ubicacion?.trim(),
                        CodProd: r.EX_CodProd,
                        CodProdLimpio: r.EX_CodProd?.trim()
                    },
                    Matches: {
                        bodega: r.BodegaMatch,
                        producto: r.ProductoMatch
                    }
                }))
            }
        };

        console.log('ðŸ“Š DIAGNÃ“STICO COMPLETO:', JSON.stringify(diagnostico, null, 2));

        res.json({
            success: true,
            diagnostico: diagnostico
        });

    } catch (err) {
        console.error('âŒ Error en diagnÃ³stico:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});

app.get('/api/inconsistencias/:cons', async (req, res) => {
    try {
        const { cons } = req.params;
        const request = new sql.Request();
        request.input('cons', sql.Int, cons);

        const result = await request.query(`
            SELECT DISTINCT
                t.Cons,
                t.Localiz,
                t.CodProd,
                t.Existencia,
                t.Conteo,
                t.Reconteo,
                CASE 
                    WHEN c.NomProd IS NOT NULL THEN c.NomProd COLLATE DATABASE_DEFAULT
                    WHEN ce.NomProd IS NOT NULL THEN ce.NomProd COLLATE DATABASE_DEFAULT
                    ELSE 'Sin nombre' COLLATE DATABASE_DEFAULT
                END as NomProd,
                CASE 
                    WHEN c.DescBodega IS NOT NULL THEN c.DescBodega COLLATE DATABASE_DEFAULT
                    WHEN cb.DescBodega IS NOT NULL THEN cb.DescBodega COLLATE DATABASE_DEFAULT
                    ELSE 'Sin bodega' COLLATE DATABASE_DEFAULT
                END as DescBodega
            FROM TOMA_FISICA_DET t
            LEFT JOIN CONSULTA_TOMA_FISICA_TF_DET c
                ON c.consec = t.Cons
                AND c.CodLocaliz COLLATE DATABASE_DEFAULT = t.Localiz COLLATE DATABASE_DEFAULT
                AND c.CodProd COLLATE DATABASE_DEFAULT = t.CodProd COLLATE DATABASE_DEFAULT
            LEFT JOIN (
                SELECT DISTINCT CodProd, NomProd, CodBodega
                FROM CONSULTA_EXISTENCIAS
            ) ce ON ce.CodProd COLLATE DATABASE_DEFAULT = t.CodProd COLLATE DATABASE_DEFAULT
                AND ce.CodBodega COLLATE DATABASE_DEFAULT = (
                    SELECT TOP 1 CodBod 
                    FROM CONSULTA_TOMA_FISICA_TF_DET 
                    WHERE consec = t.Cons
                )
            LEFT JOIN (
                SELECT DISTINCT consec, DescBodega
                FROM CONSULTA_TOMA_FISICA_TF_DET
            ) cb ON cb.consec = t.Cons
            WHERE t.Cons = @cons
              AND ISNULL(t.Existencia, 0) <> ISNULL(t.Conteo, 0)
            ORDER BY t.Localiz, t.CodProd
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener inconsistencias:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/api/asignar-reconteo', async (req, res) => {
    try {
        const { consecutivo, localizacion, usuarioReconteo } = req.body;

        if (!consecutivo || !localizacion) {
            return res.status(400).json({ error: 'Consecutivo y localizaciÃ³n son requeridos' });
        }

        const request = new sql.Request();
        request.input('cons', sql.Int, parseInt(consecutivo));
        request.input('localiz', sql.VarChar, localizacion);

        // Si se proporciona un usuario, asignarlo
        if (usuarioReconteo) {
            request.input('usuarioReconteo', sql.VarChar, usuarioReconteo);
            await request.query(`
                UPDATE TOMA_FISICA
                SET UsuarioReconteo = @usuarioReconteo
                WHERE Cons = @cons AND Localiz = @localiz
            `);
        } else {
            // Si no se proporciona, limpiar la asignaciÃ³n
            await request.query(`
                UPDATE TOMA_FISICA
                SET UsuarioReconteo = NULL
                WHERE Cons = @cons AND Localiz = @localiz
            `);
        }

        res.json({ success: true, message: 'Usuario de reconteo asignado correctamente' });
    } catch (err) {
        console.error('âŒ Error al asignar reconteo:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.post('/api/finalizar-conteo', async (req, res) => {
    try {
        const { cons, localiz } = req.body;

        if (!cons || !localiz) {
            return res.status(400).json({ error: 'Consecutivo y localizaciÃ³n son requeridos' });
        }

        const request = new sql.Request();
        request.input('cons', sql.Int, cons);
        request.input('localiz', sql.VarChar, localiz);

        await request.query(`
        UPDATE TOMA_FISICA
        SET Estado = 'FINALIZADO'
        WHERE Cons = @cons AND Localiz = @localiz
    `);

        res.json({ success: true, message: 'Conteo finalizado correctamente' });
    } catch (err) {
        console.error('Error al finalizar conteo:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

app.post('/api/finalizar-reconteo', async (req, res) => {
    try {
        const { cons, localiz } = req.body;

        if (!cons || !localiz) {
            return res.status(400).json({ error: 'Consecutivo y localizaciÃ³n son requeridos' });
        }


        res.json({
            success: true,
            message: 'Reconteo finalizado correctamente'
        });
    } catch (err) {
        console.error('âŒ Error al finalizar reconteo:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});

async function updateRecount(cod, value) {
    const newValue = parseInt(value) || 0;
    recounts[cod] = newValue;

    try {
        const resp = await fetch(`${API_BASE_URL}/actualizar-reconteo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cons: currentTask.Cons,
                localiz: currentTask.Localiz,
                codProd: cod,
                reconteo: newValue
            })
        });

        if (!resp.ok) {
            console.error('âŒ Error al actualizar reconteo');
        } else {
            console.log(`âœ… Reconteo actualizado para ${cod}: ${newValue}`);
        }
    } catch (error) {
        console.error('Error en la conexiÃ³n al guardar reconteo:', error);
    }
}

function adjustRecount(cod, delta) {
    const input = document.getElementById(`recount_${cod}`);
    let value = parseInt(input.value) || 0;
    value = Math.max(0, value + delta);
    input.value = value;
    updateRecount(cod, value);
}

// ðŸ†• Tareas de reconteo asignadas a un usuario
app.get('/api/tareas-reconteo/:usuario', async (req, res) => {
    try {
        const { usuario } = req.params;


        const request = new sql.Request();
        request.input('usuario', sql.VarChar, usuario);

        const result = await request.query(`
            SELECT DISTINCT t.Cons, t.Localiz
            FROM TOMA_FISICA t
            WHERE t.UsuarioReconteo = @usuario
            ORDER BY t.Cons, t.Localiz
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error('âŒ Error al obtener tareas de reconteo:', err);
        res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
});

// RUTA CORREGIDA: Actualizar o insertar reconteo (sin sumar acumulados)
app.post('/api/actualizar-reconteo', async (req, res) => {
    try {
        const { cons, localiz, codProd, reconteo } = req.body;

        if (!cons || !localiz || !codProd || reconteo === undefined) {
            return res.status(400).json({
                error: 'Todos los campos son requeridos',
                received: { cons, localiz, codProd, reconteo }
            });
        }

        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // Verificar si ya existe el producto
            const checkRequest = new sql.Request(transaction);
            checkRequest.input('cons', sql.Int, parseInt(cons));
            checkRequest.input('localiz', sql.VarChar, localiz);
            checkRequest.input('codProd', sql.VarChar, codProd);

            const checkResult = await checkRequest.query(`
                SELECT COUNT(*) AS count
                FROM TOMA_FISICA_DET
                WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
            `);

            const exists = checkResult.recordset[0].count > 0;

            if (exists) {
               
                const updateRequest = new sql.Request(transaction);
                updateRequest.input('cons', sql.Int, parseInt(cons));
                updateRequest.input('localiz', sql.VarChar, localiz);
                updateRequest.input('codProd', sql.VarChar, codProd);
                updateRequest.input('reconteo', sql.Int, parseInt(reconteo));

                await updateRequest.query(`
                    UPDATE TOMA_FISICA_DET
                    SET Reconteo = @reconteo
                    WHERE Cons = @cons AND Localiz = @localiz AND CodProd = @codProd
                `);
            } else {
                // ðŸ”¹ Inserta nuevo registro con Reconteo = valor enviado
                const insertRequest = new sql.Request(transaction);
                insertRequest.input('cons', sql.Int, parseInt(cons));
                insertRequest.input('localiz', sql.VarChar, localiz);
                insertRequest.input('codProd', sql.VarChar, codProd);
                insertRequest.input('reconteo', sql.Int, parseInt(reconteo));

                await insertRequest.query(`
                    INSERT INTO TOMA_FISICA_DET (Cons, Localiz, CodProd, Reconteo, Existencia)
                    VALUES (@cons, @localiz, @codProd, @reconteo, 0)
                `);
            }

            await transaction.commit();
            res.json({ success: true, message: 'Reconteo actualizado correctamente' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Error al actualizar reconteo:', err);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: err.message
        });
    }
});




// --- RUTA PARA PROBAR LA CONEXIÃ“N ---
app.get('/api/test', (req, res) => {
    res.json({ message: 'OK', timestamp: new Date().toISOString() });
});

// --- SERVIR EL FRONTEND DESDE EL BACKEND (fallback) ---
// Ruta raÃ­z - Sirve la pÃ¡gina de login
app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// --- INICIAR EL SERVIDOR ---
// Escuchar en 0.0.0.0 para que sea accesible desde otras IPs
app.listen(PORT, '0.0.0.0', () => {
    console.log(` Servidor backend corriendo en http://0.0.0.0:${PORT}`);
    console.log(`   Accede al frontend en: http://192.168.40.25:${PORT}`);
    console.log(`   Endpoint de prueba: http://192.168.40.25:${PORT}/api/test`);
});