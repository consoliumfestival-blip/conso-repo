import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { UnitProfileData } from '../services/unitProfileService';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] as string));

export const generateUnitReport = async (unitData: UnitProfileData, totalPoints: number = 0) => {
  try {
    // 1. Group data by item
    const itemsMap = new Map<string, { itemName: string; category: string; participants: any[] }>();

    unitData.participants.forEach((p) => {
      p.registrations.forEach((r) => {
        if (!itemsMap.has(r.item_id)) {
          itemsMap.set(r.item_id, {
            itemName: r.item?.name || 'Unknown Item',
            category: p.category_code || 'General',
            participants: []
          });
        }
        
        // Determine status
        let status = 'Pending';
        if (p.status === 'rejected' || r.status === 'rejected') {
          status = 'Absent (Rejected)';
        } else if (p.status === 'approved' && r.status === 'approved') {
          status = 'Attended (Approved)';
        } else if (p.status === 'approved' && r.status === 'pending') {
          status = 'Attended (Pending Item Check-in)';
        }

        // Determine result
        let resultStr = '-';
        if (r.results && r.results.length > 0) {
          const res = r.results[0];
          // Since results fetched are only public/published, we can show them safely
          const rankStr = res.rank ? `Rank ${res.rank}` : '';
          const ptsStr = res.points_awarded ? `${res.points_awarded} Pts` : '';
          const gradeStr = res.grade ? `Grade ${res.grade}` : '';
          resultStr = [rankStr, gradeStr, ptsStr].filter(Boolean).join(' | ') || '-';
        }

        itemsMap.get(r.item_id)?.participants.push({
          chestNo: p.chest_number,
          name: p.name,
          status,
          resultStr
        });
      });
    });

    // Sort items by name
    const groupedItems = Array.from(itemsMap.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));

    // 2. Construct HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(unitData.name)} - Report</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 20px;
          }
          h1 {
            text-align: center;
            color: #030E21;
            margin-bottom: 5px;
          }
          .meta {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
          }
          .item-section {
            margin-bottom: 30px;
            break-inside: auto;
            page-break-inside: auto;
          }
          .item-header {
            background-color: #f3f4f6;
            padding: 10px;
            border-left: 4px solid #3B82F6;
            margin-bottom: 10px;
          }
          .item-title {
            margin: 0;
            font-size: 16px;
            color: #1f2937;
            overflow-wrap: anywhere;
            word-break: normal;
          }
          .item-cat {
            display: block;
            font-size: 12px;
            color: #6b7280;
            margin-top: 3px;
            overflow-wrap: anywhere;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 8px 12px;
            text-align: left;
            vertical-align: top;
            overflow-wrap: anywhere;
            word-break: normal;
          }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          th {
            background-color: #f9fafb;
            color: #4b5563;
            font-weight: bold;
          }
          .absent {
            color: #dc2626;
            font-weight: bold;
          }
          .attended {
            color: #059669;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(unitData.name)}</h1>
        <div class="meta">
          Unit Summary Report<br/>
          Total Participants: ${unitData.stats.totalParticipants} | Total Points: ${totalPoints}
        </div>

        ${groupedItems.map(item => `
          <div class="item-section">
            <div class="item-header">
              <h2 class="item-title">${escapeHtml(item.itemName)}</h2>
              <span class="item-cat">${escapeHtml(item.category)}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:15%">Chest No</th>
                  <th style="width:35%">Name</th>
                  <th style="width:25%">Status</th>
                  <th style="width:25%">Result</th>
                </tr>
              </thead>
              <tbody>
                ${item.participants.sort((a, b) => a.name.localeCompare(b.name)).map(p => `
                  <tr>
                    <td>${escapeHtml(p.chestNo)}</td>
                    <td>${escapeHtml(p.name)}</td>
                    <td class="${p.status.includes('Absent') ? 'absent' : (p.status.includes('Attended') ? 'attended' : '')}">
                      ${escapeHtml(p.status)}
                    </td>
                    <td>${escapeHtml(p.resultStr)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}

        <div class="footer">
          Generated on ${new Date().toLocaleString()}<br/>
          Sahi Festival Public Portal
        </div>
      </body>
      </html>
    `;

    // 3. Print / Generate PDF
    if (Platform.OS === 'web') {
      await Print.printAsync({ html });
    } else {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
