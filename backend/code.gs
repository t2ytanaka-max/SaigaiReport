/**
 * 大村市消防団災害報告アプリ - バックエンド (Google Apps Script)
 * 
 * [重要] スプレッドシートIDを以下に設定してください。
 */
const SPREADSHEET_ID = '1Ae7XoPSovAJM1tjarVsns0sLYNoQcVg6sFBMQwd7ywk';
const SERVER_ID = ScriptApp.getScriptId().substring(0, 8); // サーバー識別用の簡易ID

function getSS() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    throw new Error('スプレッドシートを開けませんでした。IDが正しいか、権限があるか確認してください: ' + e.toString());
  }
}

/**
 * 初回セットアップ用関数
 * GASエディタ上で一度実行してください。
 */
function setup() {
  const ss = getSS();
  
  // reports シート
  let sheet = ss.getSheetByName('reports');
  if (!sheet) {
    sheet = ss.insertSheet('reports');
    sheet.appendRow([
      'ID', 'タイムスタンプ', '報告日時', '所属分団', '災害内容', 
      '詳細', '緯度', '経度', 'メモ', '活動状況', '写真URL'
    ]);
  }
  
  // LiveStreams シート
  let liveSheet = ss.getSheetByName('LiveStreams');
  if (!liveSheet) {
    liveSheet = ss.insertSheet('LiveStreams');
    liveSheet.appendRow(['Corp', 'Timestamp', 'ImageBase64', 'Status', 'Memo']);
  }
}

/**
 * データの受信と保存 (POSTリクエスト)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // 最大30秒間ロックを取得し、同時実行の不整合を防ぐ
    lock.waitLock(30000);
    
    const data = JSON.parse(e.postData.contents);
    const ss = getSS();
    let sheet = ss.getSheetByName('reports');
    if (!sheet) sheet = ss.insertSheet('reports');

    // --- Action: Delete ---
    if (data.action === 'delete' && data.id) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
            const allData = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
            let rowsToDelete = [];
            let photoUrlsToDelete = [];
            
            for (let i = 0; i < allData.length; i++) {
                if (String(allData[i][0]).trim() === String(data.id).trim()) {
                    rowsToDelete.push(i + 2);
                    // 写真URLは通常11列目 (index 10)
                    const photoUrlsStr = allData[i][10];
                    if (photoUrlsStr) {
                        const urls = photoUrlsStr.toString().split(',').filter(u => u);
                        photoUrlsToDelete.push(...urls);
                    }
                }
            }
            
            // Delete photos from Google Drive
            if (photoUrlsToDelete.length > 0) {
                photoUrlsToDelete.forEach(url => {
                    try {
                        let fileId = null;
                        const matchLh3 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                        const matchDrive = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                        const matchId = url.match(/id=([a-zA-Z0-9_-]+)/);
                        if (matchLh3) fileId = matchLh3[1];
                        else if (matchDrive) fileId = matchDrive[1];
                        else if (matchId) fileId = matchId[1];
                        
                        if (fileId) {
                            DriveApp.getFileById(fileId).setTrashed(true);
                        }
                    } catch (err) { /* ignore */ }
                });
            }
            
            if (rowsToDelete.length > 0) {
                rowsToDelete.sort((a, b) => b - a);
                rowsToDelete.forEach(row => sheet.deleteRow(row));
                return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
            }
        }
    }

    // --- Action: Live Update ---
    if (data.action === 'liveUpdate' && data.corp) {
        let liveSheet = ss.getSheetByName('LiveStreams');
        if (!liveSheet) {
            liveSheet = ss.insertSheet('LiveStreams');
            liveSheet.appendRow(['Corp', 'Timestamp', 'ImageBase64', 'Status', 'Memo']);
        }
        
        const lastRow = liveSheet.getLastRow();
        let rowIndex = -1;
        
        // ヘッダー(1行目)以外のデータがある場合のみ検索
        if (lastRow > 1) {
            const corpData = liveSheet.getRange(2, 1, lastRow - 1, 1).getValues();
            for (let i = 0; i < corpData.length; i++) {
                if (String(corpData[i][0]).trim() === String(data.corp).trim()) {
                    rowIndex = i + 2;
                    break;
                }
            }
        }
        
        if (data.status === 'OFFLINE' && rowIndex !== -1) {
            liveSheet.deleteRow(rowIndex);
            return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Stream removed' })).setMimeType(ContentService.MimeType.JSON);
        }

        const nowMs = Date.now();
        // セルの5万文字制限対策（45,000文字でカット）
        let safeImage = data.image || '';
        if (safeImage.length > 45000) {
            safeImage = safeImage.substring(0, 45000);
        }
        const rowData = [data.corp, nowMs, safeImage, data.status || 'LIVE', data.memo || ''];
        
        if (rowIndex !== -1) {
            liveSheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
        } else {
            if (data.status !== 'OFFLINE') {
                liveSheet.appendRow(rowData);
            }
        }
        
        return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- Action: Default Report Save ---
    const photoUrls = [];
    if (data.photos && Array.isArray(data.photos)) {
      let folder;
      const folders = DriveApp.getFoldersByName('DisasterReports_Photos');
      folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('DisasterReports_Photos');
      
      data.photos.forEach((photoData, index) => {
        try {
            if (photoData.startsWith('http')) { photoUrls.push(photoData); return; }
            if (photoData.includes('base64,')) {
              const parts = photoData.split(',');
              const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), parts[0].split(':')[1].split(';')[0], `report_${Date.now()}_${index}.jpg`);
              const file = folder.createFile(blob);
              file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
              photoUrls.push(`https://lh3.googleusercontent.com/d/${file.getId()}`);
            }
        } catch (e) { photoUrls.push('Error'); }
      });
    }

    const reportId = data.id || Utilities.getUuid();
    const lastRow = sheet.getLastRow();
    let rowIndex = -1;
    
    if (lastRow > 1) {
        // すでに登録済みのIDがあるかチェック（1列目をまとめて取得して検索）
        const idRange = sheet.getRange(2, 1, lastRow - 1, 1);
        const idData = idRange.getValues();
        for (let i = 0; i < idData.length; i++) {
            if (String(idData[i][0]).trim() === String(reportId).trim()) {
                rowIndex = i + 2;
                break;
            }
        }
    }

    const rowData = [
      reportId,
      new Date(),
      data.reportDate,
      data.corp,
      data.category,
      data.categoryDetail || '',
      data.location ? data.location.lat : '',
      data.location ? data.location.lng : '',
      data.memo,
      data.status,
      photoUrls.join(',')
    ];

    if (rowIndex !== -1) {
        // すでにある報告を最新の内容で上書き
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
        // 新しい報告として追加
        sheet.appendRow(rowData);
    }

    // スプレッドシートを最新順（Timestamp: 2列目）に自動で並び替える
    const lastRowAfterUpdate = sheet.getLastRow();
    if (lastRowAfterUpdate > 1) {
      sheet.getRange(2, 1, lastRowAfterUpdate - 1, sheet.getLastColumn())
           .sort({column: 2, ascending: false});
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("doPost Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    // 処理が終わったらロックを確実に解除
    lock.releaseLock();
  }
}

/**
 * データの取得 (GETリクエスト)
 */
function doGet(e) {
  try {
    const ss = getSS();
    
    // Ping for connectivity test
    if (e.parameter && e.parameter.action === 'ping') {
        const liveSheet = ss.getSheetByName('LiveStreams');
        let liveRowInfo = liveSheet ? `LiveRows: ${liveSheet.getLastRow()}` : 'No LiveSheet';
        let sample = '';
        if (liveSheet && liveSheet.getLastRow() > 1) {
            const lastData = liveSheet.getRange(liveSheet.getLastRow(), 1, 1, 2).getValues()[0];
            sample = ` LastCorp: ${lastData[0]}, LastTS: ${lastData[1]}`;
        }
        return ContentService.createTextOutput(JSON.stringify({ 
            status: 'success', 
            message: 'Connect OK', 
            spreadsheet: ss.getName(),
            sheetCount: ss.getSheets().length,
            liveInfo: liveRowInfo + sample
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- Action: Get Live Streams ---
    if (e.parameter && e.parameter.action === 'getLive') {
      let liveSheet = ss.getSheetByName('LiveStreams');
      if (!liveSheet) {
          liveSheet = ss.insertSheet('LiveStreams');
          liveSheet.appendRow(['Corp', 'Timestamp', 'ImageBase64', 'Status', 'Memo']);
          return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }
      
      const lastRow = liveSheet.getLastRow();
      if (lastRow <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      
      const rows = liveSheet.getRange(2, 1, lastRow - 1, liveSheet.getLastColumn()).getValues();
      const nowMs = Date.now();
      const isDebug = e.parameter.debug === 'true';
      const scriptIdHash = SERVER_ID; // グローバルで定義したSERVER_IDを利用

      const activeStreams = rows.map(row => {
          const ts = Number(row[1]);
          return {
              corp: row[0],
              timestamp: ts,
              image: row[2],
              status: row[3],
              memo: row[4],
              age: ts ? (nowMs - ts) / 1000 : null,
              serverId: scriptIdHash
          };
      }).filter(stream => {
          if (isDebug) return true;
          // 有効期限を短縮 (2分 = 120,000ms)。現場は7-10秒ごとに送るので十分な長さです。
          return stream.timestamp && 
                 (nowMs - stream.timestamp) < 120000 &&
                 stream.status === 'LIVE';
      });
      
      activeStreams.sort((a, b) => b.timestamp - a.timestamp);
      return ContentService.createTextOutput(JSON.stringify(activeStreams)).setMimeType(ContentService.MimeType.JSON);
    }

    // --- Action: Get Image (Proxy) ---
    if (e.parameter && e.parameter.action === 'getImage' && e.parameter.id) {
       const file = DriveApp.getFileById(e.parameter.id);
       const blob = file.getBlob();
       const b64 = Utilities.base64Encode(blob.getBytes());
       const mime = blob.getContentType();
       return ContentService.createTextOutput(JSON.stringify({
         status: 'success', image: `data:${mime};base64,${b64}`
       })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- Action: Get Report List ---
    const sheet = ss.getSheetByName('reports');
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);

    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    
    const rawHeaders = rows[0];
    const data = rows.slice(1).map(row => {
      const obj = {};
      rawHeaders.forEach((header, i) => {
        let rawKey = String(header).trim();
        let key = rawKey.toLowerCase();
        
        // 1. 報告日時 / reportDate (calendarinfo, timestamp も含む)
        if (key === '報告日時' || key === 'reportdate' || key === 'timestamp' || key === 'タイムスタンプ' || key === 'calendarinfo') {
            obj['reportDate'] = row[i];
            obj['timestamp'] = row[i]; // 両方にセット
        }
        // 2. 所属分団 / corp
        else if (key === '所属分団' || key === 'corp') obj['corp'] = row[i];
        // 3. 災害内容 / category
        else if (key === '災害内容' || key === 'category') obj['category'] = row[i];
        // 4. 詳細 / categoryDetail
        else if (key === '詳細' || key === 'categorydetail') obj['categoryDetail'] = row[i];
        // 5. 緯度 / lat
        else if (key === '緯度' || key === 'lat') obj['lat'] = row[i];
        // 6. 経度 / lng
        else if (key === '経度' || key === 'lng') obj['lng'] = row[i];
        // 7. メモ / memo (description も含む)
        else if (key === 'メモ' || key === 'memo' || key === 'description') obj['memo'] = row[i];
        // 8. 活動状況 / status
        else if (key === '活動状況' || key === 'status') obj['status'] = row[i];
        // 9. 写真URL / photoUrls (photourls, photos も含む)
        else if (key === '写真url' || key === 'photourls' || key === 'photos') obj['photoUrls'] = row[i];
        // 10. ID
        else if (key === 'id') obj['id'] = row[i];
        
        // 念のため元のキーでも保持
        obj[rawKey] = row[i];
      });

      const toIsoString = (val) => {
          if (!val) return null;
          if (val instanceof Date) return val.toISOString();
          // もし数値（タイムスタンプ）ならDateに変換してISO化
          if (typeof val === 'number' && val > 1000000000000) return new Date(val).toISOString();
          return String(val);
      };

      const rawPhotos = obj.photoUrls ? obj.photoUrls.toString().split(',').filter(u => u) : [];
      
      return {
        id: obj.id,
        data: {
          reportDate: toIsoString(obj.reportDate || obj.timestamp),
          corp: obj.corp,
          category: obj.category,
          categoryDetail: obj.categoryDetail,
          memo: obj.memo,
          status: obj.status, 
          location: (obj.lat && obj.lng) ? { lat: Number(obj.lat), lng: Number(obj.lng) } : null,
          photos: rawPhotos
        },
        status: 'synced', 
        source: 'server',
        created_at: obj.timestamp instanceof Date ? obj.timestamp.getTime() : (typeof obj.timestamp === 'number' ? obj.timestamp : Date.now())
      };
    }).filter(item => {
        // ステータスが 'OFFLINE' のものは、LIVE配信の停止信号の残骸なので表示しない
        return item.data.status !== 'OFFLINE';
    });

    data.sort((a, b) => new Date(b.data.reportDate || 0) - new Date(a.data.reportDate || 0));
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log("doGet Error: " + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * お掃除用：不要なデータ（OFFLINE行）をスプレッドシートから一括削除します。
 * GASエディタでこの関数を選択して実行してください。
 */
function cleanupOldData() {
    const ss = getSS();
    
    // 1. LiveStreamsシートの掃除 (すべて削除)
    const liveSheet = ss.getSheetByName('LiveStreams');
    if (liveSheet && liveSheet.getLastRow() > 1) {
        liveSheet.deleteRows(2, liveSheet.getLastRow() - 1);
        Logger.log("LiveStreams sheet cleaned.");
    }

    // 2. reportsシートの掃除 (statusが 'OFFLINE' の行を削除)
    const reportSheet = ss.getSheetByName('reports');
    if (reportSheet && reportSheet.getLastRow() > 1) {
        const rows = reportSheet.getDataRange().getValues();
        let rowsDeleted = 0;
        // 下の行から削除していかないとインデックスがずれるので逆順にループ
        for (let i = rows.length - 1; i >= 1; i--) {
            // ステータス列 (10列目: index 9 または、活動状況の列名) を確認
            // 今回のrowData設計では statusは index 9
            const status = String(rows[i][9]).trim();
            if (status === 'OFFLINE') {
                reportSheet.deleteRow(i + 1);
                rowsDeleted++;
            }
        }
        Logger.log("Reports sheet cleaned: " + rowsDeleted + " rows removed.");
    }
}
