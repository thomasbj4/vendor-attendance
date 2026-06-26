import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import { getPool } from '../database/db';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest, AttendanceRecord } from '../types';
import { logAudit } from '../services/audit';

const router = Router();
router.use(authenticateToken);
router.use(requireRole('admin'));

function calcRegularHours(record: AttendanceRecord): number {
  if (!record.clock_in || !record.clock_out) return 8;
  const [inH, inM]   = record.clock_in.split(':').map(Number);
  const [outH, outM] = record.clock_out.split(':').map(Number);
  return Math.max(0, ((outH * 60 + outM) - (inH * 60 + inM) - (record.break_minutes || 0)) / 60);
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  return `${hrs}h ${Math.round((h - hrs) * 60)}m`;
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B5ED4' } };
const ALT_FILL:    ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } };
const TOTAL_FILL:  ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
const SIG_FILL:    ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FFF8' } };

interface RecordRow extends AttendanceRecord {
  user_name: string;
  user_email: string;
  department: string;
}
interface UserInfo { id: number; name: string; email: string; department: string; }

async function buildAttendanceWorkbook(
  records: RecordRow[],
  users: UserInfo[],
  label: string,
  signatures: Map<number, string>,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = process.env.APP_NAME || 'Vendor Attendance';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: 'Employee',     key: 'name',    width: 22 },
    { header: 'Department',   key: 'dept',    width: 18 },
    { header: 'Days Present', key: 'present', width: 14 },
    { header: 'Days Absent',  key: 'absent',  width: 13 },
    { header: 'Regular Hours',key: 'reg',     width: 15 },
    { header: 'Extra Hours',  key: 'extra',   width: 13 },
    { header: 'Total Hours',  key: 'total',   width: 13 },
    { header: 'Signed',       key: 'signed',  width: 10 },
  ];
  const hRow = summary.getRow(1);
  hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow.fill = HEADER_FILL;
  hRow.height = 22;
  hRow.alignment = { horizontal: 'center', vertical: 'middle' };

  for (const u of users) {
    const ur      = records.filter(r => r.user_id === u.id);
    const present = ur.filter(r => r.status === 'present' || r.status === 'half-day').length;
    const absent  = ur.filter(r => r.status === 'absent').length;
    const reg     = ur.reduce((s, r) => s + calcRegularHours(r), 0);
    const extra   = ur.reduce((s, r) => s + (r.extra_hours || 0), 0);
    summary.addRow({
      name: u.name, dept: u.department || '—',
      present, absent,
      reg: formatHours(reg), extra: formatHours(extra), total: formatHours(reg + extra),
      signed: signatures.has(u.id) ? '✓' : '—',
    });
  }
  summary.eachRow((row, i) => {
    if (i === 1) return;
    if (i % 2 === 0) row.fill = ALT_FILL;
    row.eachCell(c => {
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const u of users) {
    const userRecords = records.filter(r => r.user_id === u.id).sort((a, b) => a.date.localeCompare(b.date));
    if (userRecords.length === 0) continue;

    const ws = workbook.addWorksheet(u.name.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 31));
    ws.mergeCells('A1:I1');
    ws.getCell('A1').value = 'VENDOR ATTENDANCE REPORT';
    ws.getCell('A1').font  = { bold: true, size: 14, color: { argb: 'FF3B5ED4' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.getCell('A3').value = 'Employee:';   ws.getCell('B3').value = u.name;
    ws.getCell('A4').value = 'Department:'; ws.getCell('B4').value = u.department || '—';
    ws.getCell('A5').value = 'Period:';     ws.getCell('B5').value = label;
    ws.getCell('E3').value = 'Total Days:';    ws.getCell('F3').value = userRecords.length;
    ws.getCell('E4').value = 'Regular Hours:'; ws.getCell('F4').value = formatHours(userRecords.reduce((s, r) => s + calcRegularHours(r), 0));
    ws.getCell('E5').value = 'Extra Hours:';   ws.getCell('F5').value = formatHours(userRecords.reduce((s, r) => s + (r.extra_hours || 0), 0));
    ['A3','A4','A5','E3','E4','E5'].forEach(c => { ws.getCell(c).font = { bold: true }; });

    const tableStart = 8;
    ws.columns = [
      { key: 'date',   width: 14 }, { key: 'day',    width: 10 },
      { key: 'start',  width: 12 }, { key: 'end',    width: 12 },
      { key: 'brk',    width: 13 }, { key: 'regular',width: 14 },
      { key: 'extra',  width: 14 }, { key: 'status', width: 12 },
      { key: 'notes',  width: 24 },
    ];
    ws.getRow(tableStart).values = ['Date','Day','Start','End','Break (min)','Regular Hrs','Extra Hrs','Status','Notes'];
    const th = ws.getRow(tableStart);
    th.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    th.fill = HEADER_FILL;
    th.height = 20;

    let totalReg = 0, totalExtra = 0;
    userRecords.forEach((r, i) => {
      const reg = calcRegularHours(r);
      totalReg += reg; totalExtra += r.extra_hours || 0;
      const rowNum   = tableStart + 1 + i;
      const extraStr = r.extra_hours
        ? `${formatHours(r.extra_hours)}${r.extra_start && r.extra_end ? ` (${r.extra_start}–${r.extra_end})` : ''}`
        : '—';
      ws.getRow(rowNum).values = [
        r.date, days[new Date(r.date + 'T00:00:00').getDay()],
        r.clock_in || '08:00', r.clock_out || '16:00',
        r.break_minutes || 0, formatHours(reg), extraStr,
        r.status.charAt(0).toUpperCase() + r.status.slice(1), r.notes || '',
      ];
      const row = ws.getRow(rowNum);
      if (i % 2 === 0) row.fill = ALT_FILL;
      if (r.status === 'absent') row.eachCell(c => { c.font = { color: { argb: 'FFCC0000' } }; });
      row.eachCell(c => {
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    const totRow = tableStart + 1 + userRecords.length;
    ws.getRow(totRow).values = ['TOTAL','','','','', formatHours(totalReg), formatHours(totalExtra),'',''];
    ws.getRow(totRow).font = { bold: true };
    ws.getRow(totRow).fill = TOTAL_FILL;

    const sigData = signatures.get(u.id);
    if (sigData) {
      const sigRow = totRow + 2;
      ws.getCell(`A${sigRow}`).value = 'Employee Signature:';
      ws.getCell(`A${sigRow}`).font  = { bold: true };
      ws.getCell(`A${sigRow + 1}`).value = u.name;
      ws.getCell(`A${sigRow + 1}`).font  = { italic: true, color: { argb: 'FF666666' } };
      for (let rr = sigRow; rr <= sigRow + 6; rr++) {
        for (let cc = 2; cc <= 6; cc++) {
          ws.getCell(rr, cc).fill = SIG_FILL;
          ws.getCell(rr, cc).border = {
            top: { style: 'thin', color: { argb: 'FFCCCCCC' } }, bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
            left: { style: 'thin', color: { argb: 'FFCCCCCC' } }, right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          };
        }
        ws.getRow(rr).height = 16;
      }
      try {
        const base64  = sigData.replace(/^data:image\/\w+;base64,/, '');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imgBuf  = Buffer.from(base64, 'base64') as any;
        const imageId = workbook.addImage({ buffer: imgBuf, extension: 'png' });
        ws.addImage(imageId, `B${sigRow}:F${sigRow + 6}`);
      } catch { ws.getCell(`B${sigRow}`).value = '[signature image]'; }
    }
  }
  return workbook;
}

// POST /export/attendance
// Body: { user_ids?: number[], start_date?: string, end_date?: string }
// Only exports records covered by submitted/signed timesheets.
// Marks submitted timesheets as signed after export.
router.post('/attendance', async (req: AuthenticatedRequest, res: Response) => {
  const { user_ids, start_date, end_date } = req.body;
  const pool = getPool();

  try {
    // 1. Resolve users
    const userParams: unknown[] = [];
    let usersQuery = `SELECT id, name, email, department FROM users WHERE is_active = 1 AND role != 'admin'`;
    if (user_ids?.length > 0) {
      usersQuery += ` AND id IN (${(user_ids as number[]).map((_: unknown, i: number) => `$${i + 1}`).join(',')})`;
      userParams.push(...user_ids);
    }
    const { rows: allUsers } = await pool.query<UserInfo>(usersQuery, userParams);
    if (allUsers.length === 0) { res.status(404).json({ error: 'No users found.' }); return; }

    // 2. Find submitted/signed timesheets overlapping the date range
    const userIdList = allUsers.map(u => u.id);
    const tsParams: unknown[] = [...userIdList];
    let idx = userIdList.length + 1;
    let tsQuery = `
      SELECT t.user_id, s.data AS signature_data, t.id AS timesheet_id, t.status
      FROM timesheets t
      LEFT JOIN signatures s ON s.id = t.signature_id
      WHERE t.status IN ('submitted','signed')
        AND t.user_id IN (${userIdList.map((_: unknown, i: number) => `$${i + 1}`).join(',')})
    `;
    if (start_date) { tsQuery += ` AND t.period_end >= $${idx++}`;   tsParams.push(start_date); }
    if (end_date)   { tsQuery += ` AND t.period_start <= $${idx++}`; tsParams.push(end_date); }
    tsQuery += ' ORDER BY t.submitted_at DESC';

    const { rows: tsRows } = await pool.query<{
      user_id: number; signature_data: string | null; timesheet_id: number; status: string;
    }>(tsQuery, tsParams);

    const signedUserIds = new Set(tsRows.map(r => r.user_id));
    const exportableUsers = allUsers.filter(u => signedUserIds.has(u.id));

    if (exportableUsers.length === 0) {
      res.status(400).json({
        error: 'No submitted timesheets found for the selected users and date range. ' +
               'Employees must submit their timesheets before the report can be exported.',
      });
      return;
    }

    const signatures  = new Map<number, string>();
    const toSignIds:  number[] = [];
    for (const row of tsRows) {
      if (!signatures.has(row.user_id) && row.signature_data) {
        signatures.set(row.user_id, row.signature_data);
      }
      if (row.status === 'submitted') toSignIds.push(row.timesheet_id);
    }

    // 3. Attendance records
    const exportUserIds = exportableUsers.map(u => u.id);
    const recParams: unknown[] = [...exportUserIds];
    idx = exportUserIds.length + 1;
    let recQuery = `
      SELECT a.*, u.name AS user_name, u.email AS user_email, u.department
      FROM attendance a JOIN users u ON u.id = a.user_id
      WHERE a.user_id IN (${exportUserIds.map((_: unknown, i: number) => `$${i + 1}`).join(',')})
    `;
    if (start_date) { recQuery += ` AND a.date >= $${idx++}`; recParams.push(start_date); }
    if (end_date)   { recQuery += ` AND a.date <= $${idx++}`; recParams.push(end_date); }
    recQuery += ' ORDER BY u.name, a.date';
    const { rows: records } = await pool.query<RecordRow>(recQuery, recParams);

    const label   = start_date && end_date ? `${start_date} to ${end_date}` : 'All time';
    const dateStr = new Date().toISOString().split('T')[0];

    // 4. Build workbook
    const workbook = await buildAttendanceWorkbook(records, exportableUsers, label, signatures);

    // 5. Mark submitted timesheets as signed
    if (toSignIds.length > 0) {
      await pool.query(
        `UPDATE timesheets SET status = 'signed', signed_by = $1, signed_at = NOW(), updated_at = NOW()
         WHERE id = ANY($2::int[])`,
        [req.user!.userId, toSignIds],
      );
      for (const tsId of toSignIds) {
        await logAudit(pool, req.user!.userId, req.user!.email, 'timesheet.sign',
          'timesheet', tsId, { via: 'export', label });
      }
    }

    // 6. Stream file to client
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${dateStr}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed.' });
  }
});

// GET /export/check?user_ids=1,2&start_date=...&end_date=...
// Returns which users are eligible (have submitted timesheets) and which are not.
router.get('/check', async (req: AuthenticatedRequest, res: Response) => {
  const { user_ids, start_date, end_date } = req.query;
  const pool = getPool();

  const rawIds = user_ids ? (user_ids as string).split(',').map(Number).filter(Boolean) : [];

  try {
    const userParams: unknown[] = [];
    let usersQuery = `SELECT id, name FROM users WHERE is_active = 1 AND role != 'admin'`;
    if (rawIds.length > 0) {
      usersQuery += ` AND id IN (${rawIds.map((_: unknown, i: number) => `$${i + 1}`).join(',')})`;
      userParams.push(...rawIds);
    }
    const { rows: users } = await pool.query(usersQuery, userParams);
    const userIdList = users.map((u: { id: number }) => u.id);
    if (userIdList.length === 0) { res.json({ eligible: [], ineligible: [] }); return; }

    const tsParams: unknown[] = [...userIdList];
    let idx = userIdList.length + 1;
    let tsQuery = `
      SELECT DISTINCT t.user_id
      FROM timesheets t
      WHERE t.status IN ('submitted','signed')
        AND t.user_id IN (${userIdList.map((_: unknown, i: number) => `$${i + 1}`).join(',')})
    `;
    if (start_date) { tsQuery += ` AND t.period_end >= $${idx++}`;   tsParams.push(start_date as string); }
    if (end_date)   { tsQuery += ` AND t.period_start <= $${idx++}`; tsParams.push(end_date as string); }

    const { rows: tsRows } = await pool.query(tsQuery, tsParams);
    const signedIds = new Set(tsRows.map((r: { user_id: number }) => r.user_id));

    res.json({
      eligible:   users.filter((u: { id: number }) =>  signedIds.has(u.id)),
      ineligible: users.filter((u: { id: number }) => !signedIds.has(u.id)),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

export default router;
