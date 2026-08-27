// server.js - 急诊抢救护理记录多端同步服务
const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'emergency-nursing-secret-key-2024';

// 确保数据目录存在（支持云平台持久化磁盘环境变量）
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化数据库
const db = new Database(path.join(dataDir, 'emergency.db'));

// 创建用户表
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'editor',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// 为已存在的表添加role字段（兼容旧数据库）
try {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'editor'`);
} catch (e) {
    // 字段已存在，忽略
}

// 创建记录表
db.exec(`
    CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        patient_name TEXT,
        gender TEXT,
        age TEXT,
        admission_time TEXT,
        address TEXT,
        arrival_method TEXT,
        arrival_other TEXT,
        first_doctor TEXT,
        diagnosis TEXT,
        rescue_start_time TEXT,
        records TEXT,
        outcome_time TEXT,
        outcome_method TEXT,
        outcome_other TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

// 中间件
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务 - Web前端
app.use(express.static(path.join(__dirname, '..', 'public')));

// JWT认证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: '未提供认证令牌' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

// 写权限检查中间件（只读用户不允许增删改）
function requireWritePermission(req, res, next) {
    if (req.user.role === 'viewer') {
        return res.status(403).json({ success: false, message: '当前账号为只读权限，不允许修改数据' });
    }
    next();
}

// ==================== 用户认证API ====================

// 用户注册
app.post('/api/register', (req, res) => {
    const { username, password, display_name, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    if (username.length < 3) {
        return res.status(400).json({ success: false, message: '用户名至少3个字符' });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: '密码至少6个字符' });
    }

    // 检查用户名是否已存在
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 创建用户
    const userRole = (role === 'viewer' || role === 'admin') ? role : 'editor';
    const result = db.prepare('INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)').run(
        username, hashedPassword, display_name || username, userRole
    );

    // 生成JWT
    const token = jwt.sign(
        { id: result.lastInsertRowid, username, role: userRole },
        JWT_SECRET,
        { expiresIn: '30d' }
    );

    res.json({
        success: true,
        message: '注册成功',
        token,
        user: { id: result.lastInsertRowid, username, display_name: display_name || username, role: userRole }
    });
});

// 用户登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    // 查找用户
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
        return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 验证密码
    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 生成JWT
    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role || 'editor' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );

    res.json({
        success: true,
        message: '登录成功',
        token,
        user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role || 'editor' }
    });
});

// 验证token
app.get('/api/verify', authenticateToken, (req, res) => {
    const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, user });
});

// ==================== 记录CRUD API ====================

// 获取记录列表
app.get('/api/records', authenticateToken, (req, res) => {
    const { keyword, page = 1, pageSize = 50 } = req.query;
    const offset = (page - 1) * pageSize;

    let query = 'SELECT * FROM records WHERE user_id = ?';
    let params = [req.user.id];

    if (keyword) {
        query += ' AND (patient_name LIKE ? OR diagnosis LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(pageSize), offset);

    const records = db.prepare(query).all(...params);

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM records WHERE user_id = ?';
    let countParams = [req.user.id];
    if (keyword) {
        countQuery += ' AND (patient_name LIKE ? OR diagnosis LIKE ?)';
        countParams.push(`%${keyword}%`, `%${keyword}%`);
    }
    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({ success: true, data: records, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 获取单条记录详情
app.get('/api/records/:id', authenticateToken, (req, res) => {
    const record = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!record) {
        return res.status(404).json({ success: false, message: '记录不存在' });
    }

    res.json({ success: true, data: record });
});

// 导出单条记录为Excel（完全按照纸质表格样式）
app.get('/api/records/:id/export', authenticateToken, async (req, res) => {
    try {
        const record = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!record) {
            return res.status(404).json({ success: false, message: '记录不存在' });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('急诊抢救护理记录', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 }
        });

        // 设置列宽
        worksheet.columns = [
            { width: 12 }, { width: 14 }, { width: 10 }, { width: 10 },
            { width: 12 }, { width: 10 }, { width: 35 }, { width: 10 }
        ];

        // 样式定义
        const borderStyle = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
        };
        const titleFont = { name: '宋体', size: 18, bold: true };
        const headerFont = { name: '宋体', size: 11, bold: true };
        const normalFont = { name: '宋体', size: 11 };
        const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const leftAlign = { horizontal: 'left', vertical: 'middle', wrapText: true };

        // 第1行：标题
        worksheet.mergeCells('A1:H1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = '急诊抢救护理记录';
        titleCell.font = titleFont;
        titleCell.alignment = centerAlign;
        worksheet.getRow(1).height = 35;

        // 第2行：患者姓名、性别、年龄、入院时间、工作单位/家庭住址
        worksheet.getCell('A2').value = '患者姓名：';
        worksheet.getCell('B2').value = record.patient_name || '';
        worksheet.getCell('C2').value = '性别：';
        worksheet.getCell('D2').value = record.gender || '';
        worksheet.getCell('E2').value = '年龄：';
        worksheet.getCell('F2').value = record.age || '';
        worksheet.getCell('G2').value = '入院时间：';
        worksheet.getCell('H2').value = record.admission_time || '';
        worksheet.getRow(2).height = 25;

        // 第3行：工作单位/家庭住址
        worksheet.mergeCells('A3:B3');
        worksheet.getCell('A3').value = '工作单位/家庭住址：';
        worksheet.mergeCells('C3:H3');
        worksheet.getCell('C3').value = record.address || '';
        worksheet.getRow(3).height = 25;

        // 第4行：来院方式
        worksheet.mergeCells('A4:B4');
        worksheet.getCell('A4').value = '来院方式：';
        const arrivalMethods = ['120救护车护送', '家属护送', '同事护送', '公安人员护送', '自行就医', '其他'];
        const arrivalStr = arrivalMethods.map(m => {
            const checked = (record.arrival_method === m) ? '☑' : '☐';
            return `${checked}${m}`;
        }).join('  ');
        worksheet.mergeCells('C4:H4');
        worksheet.getCell('C4').value = arrivalStr + (record.arrival_other ? '  其他：' + record.arrival_other : '');
        worksheet.getRow(4).height = 25;

        // 第5行：首诊医生、诊断
        worksheet.getCell('A5').value = '首诊医生：';
        worksheet.mergeCells('B5:C5');
        worksheet.getCell('B5').value = record.first_doctor || '';
        worksheet.getCell('D5').value = '诊断：';
        worksheet.mergeCells('E5:H5');
        worksheet.getCell('E5').value = record.diagnosis || '';
        worksheet.getRow(5).height = 25;

        // 第6行：开始抢救时间
        worksheet.mergeCells('A6:B6');
        worksheet.getCell('A6').value = '开始抢救时间：';
        worksheet.mergeCells('C6:H6');
        worksheet.getCell('C6').value = record.rescue_start_time || '';
        worksheet.getRow(6).height = 25;

        // 第7行：表头第一行（合并单元格）
        const headerRow1 = worksheet.getRow(7);
        headerRow1.getCell(1).value = '时间';
        headerRow1.getCell(2).value = '意 识';
        headerRow1.getCell(3).value = '心 率';
        headerRow1.getCell(4).value = '呼 吸';
        headerRow1.getCell(5).value = '血 压';
        headerRow1.getCell(6).value = 'SpO₂';
        headerRow1.getCell(7).value = '病情观察及治疗';
        headerRow1.getCell(8).value = '签 名';
        worksheet.getRow(7).height = 25;

        // 第8行：表头第二行（意识的说明）
        const headerRow2 = worksheet.getRow(8);
        headerRow2.getCell(1).value = '';
        headerRow2.getCell(2).value = '1清醒 2嗜睡 3朦胧 4浅昏迷 5深昏迷';
        headerRow2.getCell(3).value = '(次/分钟)';
        headerRow2.getCell(4).value = '(次/分)';
        headerRow2.getCell(5).value = 'mmHg';
        headerRow2.getCell(6).value = '%';
        headerRow2.getCell(7).value = '';
        headerRow2.getCell(8).value = '';
        worksheet.getRow(8).height = 20;

        // 合并表头单元格
        worksheet.mergeCells('A7:A8'); // 时间
        worksheet.mergeCells('C7:C8'); // 心率
        worksheet.mergeCells('D7:D8'); // 呼吸
        worksheet.mergeCells('E7:E8'); // 血压
        worksheet.mergeCells('F7:F8'); // SpO2
        worksheet.mergeCells('G7:G8'); // 病情观察及治疗
        worksheet.mergeCells('H7:H8'); // 签名

        // 解析抢救记录
        let rescueRecords = [];
        try {
            rescueRecords = JSON.parse(record.records || '[]');
        } catch (e) {
            rescueRecords = [];
        }

        // 确保至少有15行空白行
        const minRows = 15;
        const dataRows = Math.max(rescueRecords.length, minRows);

        // 写入抢救记录数据
        for (let i = 0; i < dataRows; i++) {
            const rowNum = 9 + i;
            const row = worksheet.getRow(rowNum);
            const rec = rescueRecords[i] || {};
            row.getCell(1).value = rec.time || '';
            row.getCell(2).value = rec.consciousness || '';
            row.getCell(3).value = rec.heart_rate || '';
            row.getCell(4).value = rec.breath || '';
            row.getCell(5).value = rec.blood_pressure || '';
            row.getCell(6).value = rec.spo2 || '';
            row.getCell(7).value = rec.observation || '';
            row.getCell(8).value = rec.signature || '';
            row.height = 22;
        }

        // 转归行
        const outcomeRowNum = 9 + dataRows;
        const outcomeRow = worksheet.getRow(outcomeRowNum);
        outcomeRow.getCell(1).value = '转归';
        outcomeRow.getCell(2).value = '时间：';
        outcomeRow.getCell(3).value = record.outcome_time || '';
        const outcomeMethods = ['住院', '出院', '留观', '转院', '死亡', '其他'];
        const outcomeStr = outcomeMethods.map(m => {
            const checked = (record.outcome_method === m) ? '☑' : '☐';
            return `${checked}${m}`;
        }).join('  ');
        worksheet.mergeCells(`D${outcomeRowNum}:H${outcomeRowNum}`);
        outcomeRow.getCell(4).value = outcomeStr + (record.outcome_other ? '  ' + record.outcome_other : '');
        outcomeRow.height = 25;

        // 应用样式到所有单元格
        const totalRows = outcomeRowNum;
        for (let r = 1; r <= totalRows; r++) {
            for (let c = 1; c <= 8; c++) {
                const cell = worksheet.getCell(r, c);
                cell.border = borderStyle;
                if (r === 1) {
                    cell.font = titleFont;
                    cell.alignment = centerAlign;
                } else if (r === 7 || r === 8) {
                    cell.font = headerFont;
                    cell.alignment = centerAlign;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                } else {
                    cell.font = normalFont;
                    if (c === 7) {
                        cell.alignment = leftAlign;
                    } else {
                        cell.alignment = centerAlign;
                    }
                }
            }
        }

        // 生成文件名
        const fileName = `急诊抢救护理记录_${record.patient_name || '未知'}_${new Date().toISOString().slice(0,10)}.xlsx`;

        // 设置响应头
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('导出Excel失败:', error);
        res.status(500).json({ success: false, message: '导出失败: ' + error.message });
    }
});

// 创建记录
app.post('/api/records', authenticateToken, requireWritePermission, (req, res) => {
    const {
        id, patient_name, gender, age, admission_time, address,
        arrival_method, arrival_other, first_doctor, diagnosis,
        rescue_start_time, records, outcome_time, outcome_method, outcome_other
    } = req.body;

    const recordId = id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = db.prepare(`
        INSERT INTO records (
            id, user_id, patient_name, gender, age, admission_time, address,
            arrival_method, arrival_other, first_doctor, diagnosis,
            rescue_start_time, records, outcome_time, outcome_method, outcome_other
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        recordId, req.user.id, patient_name, gender, age, admission_time, address,
        arrival_method, arrival_other, first_doctor, diagnosis,
        rescue_start_time, JSON.stringify(records || []), outcome_time, outcome_method, outcome_other
    );

    res.json({ success: true, message: '保存成功', id: recordId });
});

// 更新记录
app.put('/api/records/:id', authenticateToken, requireWritePermission, (req, res) => {
    const {
        patient_name, gender, age, admission_time, address,
        arrival_method, arrival_other, first_doctor, diagnosis,
        rescue_start_time, records, outcome_time, outcome_method, outcome_other
    } = req.body;

    const existing = db.prepare('SELECT id FROM records WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) {
        return res.status(404).json({ success: false, message: '记录不存在' });
    }

    db.prepare(`
        UPDATE records SET
            patient_name = ?, gender = ?, age = ?, admission_time = ?, address = ?,
            arrival_method = ?, arrival_other = ?, first_doctor = ?, diagnosis = ?,
            rescue_start_time = ?, records = ?, outcome_time = ?, outcome_method = ?,
            outcome_other = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    `).run(
        patient_name, gender, age, admission_time, address,
        arrival_method, arrival_other, first_doctor, diagnosis,
        rescue_start_time, JSON.stringify(records || []), outcome_time, outcome_method,
        outcome_other, req.params.id, req.user.id
    );

    res.json({ success: true, message: '更新成功' });
});

// 删除记录
app.delete('/api/records/:id', authenticateToken, requireWritePermission, (req, res) => {
    const result = db.prepare('DELETE FROM records WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    if (result.changes === 0) {
        return res.status(404).json({ success: false, message: '记录不存在' });
    }

    res.json({ success: true, message: '删除成功' });
});

// 批量同步（用于APP端同步数据）
app.post('/api/sync', authenticateToken, requireWritePermission, (req, res) => {
    const { records } = req.body;
    let synced = 0;

    if (records && Array.isArray(records)) {
        const insertStmt = db.prepare(`
            INSERT OR REPLACE INTO records (
                id, user_id, patient_name, gender, age, admission_time, address,
                arrival_method, arrival_other, first_doctor, diagnosis,
                rescue_start_time, records, outcome_time, outcome_method, outcome_other,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const tx = db.transaction((items) => {
            for (const record of items) {
                insertStmt.run(
                    record.id, req.user.id,
                    record.patient_name, record.gender, record.age,
                    record.admission_time, record.address,
                    record.arrival_method, record.arrival_other,
                    record.first_doctor, record.diagnosis,
                    record.rescue_start_time,
                    JSON.stringify(record.records || []),
                    record.outcome_time, record.outcome_method, record.outcome_other,
                    record.created_at || new Date().toISOString(),
                    record.updated_at || new Date().toISOString()
                );
                synced++;
            }
        });

        tx(records);
    }

    // 返回服务器上的所有记录
    const serverRecords = db.prepare('SELECT * FROM records WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);

    res.json({
        success: true,
        message: `同步完成，上传${synced}条`,
        uploaded: synced,
        serverRecords
    });
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: '服务运行正常', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('  急诊抢救护理记录多端同步服务已启动');
    console.log('========================================');
    console.log(`  本地访问: http://localhost:${PORT}`);
    console.log(`  局域网访问: http://<你的IP>:${PORT}`);
    console.log(`  数据文件: ${path.join(dataDir, 'emergency.db')}`);
    console.log('========================================');
    console.log('  首次使用请先注册账号');
    console.log('  API文档:');
    console.log('    POST /api/register - 注册');
    console.log('    POST /api/login    - 登录');
    console.log('    GET  /api/records  - 获取记录列表');
    console.log('    POST /api/records  - 创建记录');
    console.log('    PUT  /api/records/:id - 更新记录');
    console.log('    DELETE /api/records/:id - 删除记录');
    console.log('    POST /api/sync     - 批量同步');
    console.log('========================================');
});
