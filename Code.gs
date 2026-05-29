/**
 * Ma Vie — Backend Google Apps Script
 * À déployer comme « Application Web » (exécuter en tant que moi, accès : Tout le monde).
 *
 * Feuilles attendues dans le Google Sheet :
 *   - Journal        (id, date, time, pain, locations, medications, exercises, duration, intensity, events, notes, source)
 *   - Habitudes      (id, nom, type, unite, objectif_defaut, timer_minutes, icon, ordre, actif)
 *   - Planification  (id, date, habitude_id, habitude_nom, wc_type, duree_prevue, duree_reelle, complete)
 *   - Sessions       (id, date, habitude_id, habitude_nom, wc_type, duree, date_completion)
 *   - WcSeances      (id, date, type, statut, duree)
 *   - WcFormes       (id, nom, categorie)
 *   - WcPractices    (id, date, formes, passes, duree, notes)
 *   - Exercices      (id, nom, categorie, source, niveau, equipement, zone_corps,
 *                     contre_indications, description_courte, description_vocale,
 *                     duree_defaut, series_defaut, reps_defaut, frequence, variantes, bilateral)
 *
 * Si une feuille manque elle est créée automatiquement lors du premier accès.
 */

// ═════════════════════════════════════════════════════════════════
// CONFIG
// ═════════════════════════════════════════════════════════════════
var SHEETS = {
  Journal:       ['id','date','time','pain','locations','medications','exercises','duration','intensity','events','notes','source'],
  Habitudes:     ['id','nom','type','categorie','unite','objectif_defaut','timer_minutes','icon','ordre','actif'],
  Planification: ['id','date','habitude_id','habitude_nom','wc_type','duree_prevue','duree_reelle','complete'],
  Sessions:      ['id','date','habitude_id','habitude_nom','wc_type','duree','date_completion'],
  WcSeances:     ['id','date','type','statut','duree'],
  WcFormes:      ['id','nom','categorie'],
  WcPractices:   ['id','date','formes','passes','duree','notes'],
  Exercices:     ['id','nom','categorie','source','niveau','equipement','zone_corps',
                  'contre_indications','description_courte','description_vocale',
                  'duree_defaut','series_defaut','reps_defaut','frequence','variantes','bilateral'],
  Programme:     ['jour','label','type','couleur','exercices_json']
};

// ═════════════════════════════════════════════════════════════════
// ENTRY POINTS (GET + POST — Ma Vie fait des POST x-www-form-urlencoded)
// ═════════════════════════════════════════════════════════════════
function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || '';
  var out;
  try {
    switch (action) {
      case 'getAll':          out = getAll(); break;

      // Journal
      case 'save':            out = saveJournal(params); break;
      case 'delete':          out = deleteJournal(params); break;

      // Habitudes
      case 'saveHabitude':    out = saveHabitude(params); break;
      case 'updateHabitude':  out = updateHabitude(params); break;
      case 'deleteHabitude':  out = deleteHabitude(params); break;

      // Plans
      case 'savePlan':        out = savePlan(params); break;
      case 'updatePlan':      out = updatePlan(params); break;
      case 'deletePlan':      out = deletePlan(params); break;

      // Sessions
      case 'saveSession':     out = saveSession(params); break;

      // Wing Chun
      case 'saveWcSeance':    out = saveWcSeance(params); break;
      case 'addWcForme':      out = addWcForme(params); break;
      case 'deleteWcForme':   out = deleteWcForme(params); break;
      case 'saveWcPractice':  out = saveWcPractice(params); break;

      // Exercices
      case 'saveExercice':    out = saveExercice(params); break;
      case 'deleteExercice':  out = deleteExercice(params); break;
      case 'seedExercices':   out = seedExercices(); break;
      case 'saveProgrammeJour': out = saveProgrammeJour(params); break;
      case 'seedProgramme':     out = seedProgramme(); break;

      default:
        out = { ok: false, error: 'Action inconnue : ' + action };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═════════════════════════════════════════════════════════════════
// HELPERS SHEET
// ═════════════════════════════════════════════════════════════════
function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SHEETS[name]);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(SHEETS[name]);
  }
  return sh;
}

function readAll(name) {
  var sh = getSheet(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var headers = SHEETS[name];
  var values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function findRowById(sh, id) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // 1-indexed + header
  }
  return -1;
}

function upsertRow(name, record) {
  var sh = getSheet(name);
  var headers = SHEETS[name];
  var row = headers.map(function (h) {
    var v = record[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  var rowNum = findRowById(sh, record.id);
  if (rowNum > 0) {
    sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

function deleteRowById(name, id) {
  var sh = getSheet(name);
  var rowNum = findRowById(sh, id);
  if (rowNum > 0) sh.deleteRow(rowNum);
}

// ═════════════════════════════════════════════════════════════════
// ACTIONS
// ═════════════════════════════════════════════════════════════════
function getAll() {
  return {
    ok:            true,
    journal:       readAll('Journal'),
    habitudes:     readAll('Habitudes'),
    planification: readAll('Planification'),
    sessions:      readAll('Sessions'),
    wcSeances:     readAll('WcSeances'),
    wcFormes:      readAll('WcFormes'),
    wcPractices:   readAll('WcPractices'),
    exercices:     readAll('Exercices'),
    programme:     readAll('Programme')
  };
}

// ───── Journal
function saveJournal(p) {
  var e = JSON.parse(p.entry);
  var rec = {
    id: e.id,
    date: e.date,
    time: e.time || '',
    pain: e.pain,
    locations: (e.locations || []).join('|'),
    medications: JSON.stringify(e.medications || []),
    exercises: (e.exercises || []).join('|'),
    duration: e.duration || '',
    intensity: e.intensity || '',
    events: (e.events || []).join('|'),
    notes: e.notes || '',
    source: e.source || 'manuel'
  };
  upsertRow('Journal', rec);
  return { ok: true };
}

function deleteJournal(p) {
  deleteRowById('Journal', p.id);
  return { ok: true };
}

// ───── Habitudes
function saveHabitude(p) {
  var h = JSON.parse(p.habitude);
  upsertRow('Habitudes', h);
  return { ok: true };
}

function updateHabitude(p) {
  var h = JSON.parse(p.habitude);
  upsertRow('Habitudes', h);
  return { ok: true };
}

function deleteHabitude(p) {
  deleteRowById('Habitudes', p.id);
  return { ok: true };
}

// ───── Plans
function savePlan(p) {
  var plan = JSON.parse(p.plan);
  upsertRow('Planification', plan);
  return { ok: true };
}

function updatePlan(p) {
  var plan = JSON.parse(p.plan);
  upsertRow('Planification', plan);
  return { ok: true };
}

function deletePlan(p) {
  deleteRowById('Planification', p.id);
  return { ok: true };
}

// ───── Sessions
function saveSession(p) {
  var s = JSON.parse(p.session);
  upsertRow('Sessions', s);
  return { ok: true };
}

// ───── Wing Chun
function saveWcSeance(p) {
  var d = JSON.parse(p.data);
  var sh = getSheet('WcSeances');
  var rowNum = findRowById(sh, d.id);
  var headers = SHEETS.WcSeances;
  if (rowNum > 0) {
    var current = {};
    var cur = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    headers.forEach(function (h, i) { current[h] = cur[i]; });
    for (var k in d) current[k] = d[k];
    upsertRow('WcSeances', current);
  } else {
    upsertRow('WcSeances', d);
  }
  return { ok: true };
}

function addWcForme(p) {
  var f = JSON.parse(p.data);
  upsertRow('WcFormes', f);
  return { ok: true };
}

function deleteWcForme(p) {
  deleteRowById('WcFormes', p.id);
  return { ok: true };
}

function saveWcPractice(p) {
  var pr = JSON.parse(p.practice);
  var rec = {
    id: pr.id,
    date: pr.date,
    formes: Array.isArray(pr.formes) ? pr.formes.map(function(f){ return typeof f === 'object' ? (f.nom || JSON.stringify(f)) : f; }).join('|') : (pr.formes || ''),
    passes: typeof pr.passes === 'object' ? JSON.stringify(pr.passes) : (pr.passes || ''),
    duree: pr.duree || '',
    notes: pr.notes || ''
  };
  upsertRow('WcPractices', rec);
  return { ok: true };
}

// ───── Exercices
function saveExercice(p) {
  var ex = JSON.parse(p.exercice);
  upsertRow('Exercices', ex);
  return { ok: true };
}

function deleteExercice(p) {
  deleteRowById('Exercices', p.id);
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════
// SEED — Banque d'exercices initiale
// À exécuter UNE SEULE FOIS depuis l'éditeur Apps Script (ou via ?action=seedExercices)
// Ne réinsère pas si l'id existe déjà (upsert).
// ═════════════════════════════════════════════════════════════════
function seedExercices() {
  var exercices = [

    // ══════════════════════════════════════════
    // HANCHES — Flexion / Abduction
    // ══════════════════════════════════════════
    {
      id: 'ex-001',
      nom: 'Flexion de la hanche, assis',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 1,
      equipement: 'chaise',
      zone_corps: 'hanches',
      contre_indications: '',
      description_courte: 'Lever alternativement les cuisses depuis une chaise, sans appui dorsal.',
      description_vocale: 'Assis sur une chaise, dos droit. Contractez le transverse. Levez lentement la cuisse droite, redescendez, puis la gauche. Alternez.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: 10,
      frequence: 'aux 2 jours',
      variantes: 'Tempo 5 sec monter / 5 sec descendre'
    },
    {
      id: 'ex-002',
      nom: 'Abduction de la hanche contre un mur',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 1,
      equipement: 'mur',
      zone_corps: 'hanches|fessiers',
      contre_indications: '',
      description_courte: 'Couché sur le côté contre un mur, lever la jambe supérieure en glissant le talon.',
      description_vocale: 'Allongez-vous sur le côté, dos contre le mur, jambe supérieure tendue. Soulevez la jambe en glissant le talon sur le mur. Bassin stable, orteils vers l\'avant.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: 10,
      frequence: 'aux 2 jours',
      variantes: '',
      bilateral: true
    },

    // ══════════════════════════════════════════
    // FESSIERS
    // ══════════════════════════════════════════
    {
      id: 'ex-003',
      nom: 'Squat au mur, ballon',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 2,
      equipement: 'ballon|mur',
      zone_corps: 'fessiers|quadriceps',
      contre_indications: '',
      description_courte: 'Squat contre un mur avec ballon dans le dos.',
      description_vocale: 'Placez le ballon entre votre dos et le mur. Pieds à largeur des hanches. Pliez les genoux en vous assoyant sur une chaise imaginaire. Poussez sur les talons pour remonter et activer les fessiers.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: 15,
      frequence: '2x/jour',
      variantes: '10 à 20 répétitions'
    },
    {
      id: 'ex-004',
      nom: 'Flexion de hanche, ballon',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 2,
      equipement: 'ballon',
      zone_corps: 'hanches|core',
      contre_indications: '',
      description_courte: 'Assis sur ballon, lever un genou en maintenant le tronc stable.',
      description_vocale: 'Assis sur le ballon, cuisses parallèles au sol. Activez le transverse et le plancher pelvien à 20-30%. Levez un genou sans bouger le dos ni le bassin. Le ballon ne doit pas bouger.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: 10,
      frequence: '1 jour/2',
      variantes: 'Exercice à 4 pattes sur ballon'
    },
    {
      id: 'ex-005',
      nom: 'Fessiers : Élévation de la hanche',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 2,
      equipement: 'ballon|mur',
      zone_corps: 'fessiers',
      contre_indications: '',
      description_courte: 'Debout sur un pied, élever la hanche appuyée contre le ballon.',
      description_vocale: 'Tenez-vous sur la jambe à renforcer. Poussez le ballon contre le mur avec la jambe saine. Soulevez et redescendez la hanche appuyée contre le ballon.',
      duree_defaut: '',
      series_defaut: 2,
      reps_defaut: 12,
      frequence: 'aux 2 jours',
      variantes: '10 à 15 répétitions'
    },
    {
      id: 'ex-006',
      nom: 'Pas latéraux à l\'élastique',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 2,
      equipement: 'élastique',
      zone_corps: 'fessiers|hanches',
      contre_indications: '',
      description_courte: 'Pas latéraux avec élastique aux cuisses ou chevilles, dos droit.',
      description_vocale: 'Placez l\'élastique au-dessus des genoux ou aux chevilles. Faites un pas de côté en activant le moyen fessier, sans rotation à la hanche. Dos droit, orteils vers l\'avant en tout temps.',
      duree_defaut: 30,
      series_defaut: 1,
      reps_defaut: '',
      frequence: 'aux 2 jours',
      variantes: '10 à 20 répétitions',
      bilateral: true
    },

    // ══════════════════════════════════════════
    // CORE — Gainage et stabilisation
    // ══════════════════════════════════════════
    {
      id: 'ex-007',
      nom: 'CORE : Stabilisation Superman',
      categorie: 'gainage',
      source: 'physio',
      niveau: 1,
      equipement: 'tapis',
      zone_corps: 'core|dos',
      contre_indications: 'cou',
      description_courte: 'Couché sur le ventre, lever bras et jambe opposée en alternance.',
      description_vocale: 'Sur le ventre, menton rentré. Activez le transverse et le plancher pelvien. Soulevez un bras et la jambe opposée. Redescendez et alternez.',
      duree_defaut: '',
      series_defaut: 2,
      reps_defaut: 15,
      frequence: '1 jour/2',
      variantes: '10 à 20 répétitions'
    },
    {
      id: 'ex-008',
      nom: 'CORE : Levée de jambe tendue',
      categorie: 'gainage',
      source: 'physio',
      niveau: 2,
      equipement: 'tapis',
      zone_corps: 'core|hanches',
      contre_indications: 'dos',
      description_courte: 'Sur le dos, un genou à 90° et l\'autre jambe tendue qui monte et descend.',
      description_vocale: 'Sur le dos, bras le long du corps. Un genou à 90 degrés, l\'autre jambe tendue. Abaissez la jambe tendue vers le sol sans la déposer, remontez.',
      duree_defaut: '',
      series_defaut: 2,
      reps_defaut: 10,
      frequence: '1 jour/2',
      variantes: ''
    },
    {
      id: 'ex-009',
      nom: 'CORE : Planche en stabilisation sur ballon',
      categorie: 'gainage',
      source: 'physio',
      niveau: 3,
      equipement: 'ballon',
      zone_corps: 'core|épaules',
      contre_indications: 'épaule',
      description_courte: 'Planche sur ballon suisse avec mouvements latéraux, diagonaux et circulaires.',
      description_vocale: 'Position de planche sur ballon suisse, pieds à largeur des épaules. Tronc stable : 3 mouvements latéraux, 3 diagonales gauche-droite, 3 diagonales droite-gauche, 3 cercles dans le sens horaire, 3 cercles anti-horaire.',
      duree_defaut: 'max',
      series_defaut: 1,
      reps_defaut: '',
      frequence: '1 jour/2',
      variantes: ''
    },

    // ══════════════════════════════════════════
    // COU — Cervical
    // ══════════════════════════════════════════
    {
      id: 'ex-010',
      nom: 'Rétraction cervicale répétée',
      categorie: 'mobilite',
      source: 'physio',
      niveau: 1,
      equipement: 'aucun',
      zone_corps: 'cou',
      contre_indications: '',
      description_courte: 'Chin tuck debout ou assis, rentrer le menton lentement.',
      description_vocale: 'Debout ou assis bien droit. Regardez un point à hauteur des yeux. Reculez lentement la tête en rentrant le menton, guidez avec un doigt. Revenez et répétez.',
      duree_defaut: '',
      series_defaut: 1,
      reps_defaut: 10,
      frequence: 'aux 1-2h',
      variantes: ''
    },
    {
      id: 'ex-011',
      nom: 'Étirement inclinaison latérale du cou',
      categorie: 'doublon',
      source: 'physio',
      niveau: 1,
      equipement: 'mur|chaise',
      zone_corps: 'cou',
      contre_indications: 'cou',
      description_courte: 'Assis ou debout contre un mur, incliner la tête latéralement avec rotation du menton.',
      description_vocale: 'Dos contre le mur, menton neutre. Main du même côté à la base du cou. Faites glisser l\'oreille vers l\'épaule le long du mur. Tournez le menton vers le côté opposé pour l\'étirement à l\'avant du cou. Tenez 30 secondes.',
      duree_defaut: 30,
      series_defaut: '',
      reps_defaut: '3-4',
      frequence: 'tous les jours',
      variantes: 'Faire devant un miroir pour contrôler la position'
    },

    // ══════════════════════════════════════════
    // ÉPAULES
    // ══════════════════════════════════════════
    {
      id: 'ex-012',
      nom: 'ÉPAULES : Abduction horizontale à l\'élastique',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 1,
      equipement: 'élastique',
      zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Tirer l\'élastique horizontalement vers l\'arrière, paumes vers le bas.',
      description_vocale: 'Debout, bras devant vous, élastique entre les mains déjà sous tension. Tirez les bras vers l\'arrière à l\'horizontal, paumes vers le bas. Mouvement contrôlé, menton neutre.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: 15,
      frequence: 'tous les jours',
      variantes: ''
    },
    {
      id: 'ex-013',
      nom: 'ÉPAULES : Horloge au mur avec élastique',
      categorie: 'renforcement',
      source: 'physio',
      niveau: 2,
      equipement: 'élastique|mur',
      zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Face au mur, élastique aux poignets, toucher les heures de l\'horloge.',
      description_vocale: 'Debout face au mur, mains au mur, élastique aux poignets. Poussez le mur pour plaquer les omoplates. Droite : touchez 12, 1, 2, 3, 4, 5, 6 en revenant au centre. Gauche : 12, 11, 10, 9, 8, 7, 6.',
      duree_defaut: '',
      series_defaut: 1,
      reps_defaut: '2 tours',
      frequence: '1x/jour',
      variantes: ''
    },

    // ══════════════════════════════════════════
    // ARTS MARTIAUX — Push Ups
    // ══════════════════════════════════════════
    {
      id: 'ex-014',
      nom: 'Pompes inclinées (Incline Push Ups)',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'aucun',
      zone_corps: 'membres_sup|core',
      contre_indications: 'épaule',
      description_courte: 'Pompes avec les mains surélevées. Point de départ de la progression.',
      description_vocale: 'Mains sur une surface surélevée. Corps droit des talons à la tête. Descendez la poitrine vers la surface, remontez.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: '20-30',
      frequence: '2-3x/semaine',
      variantes: 'Isométrique — Shifting — Twisting — Circulaire'
    },
    {
      id: 'ex-015',
      nom: 'Pompes (Push Ups)',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 2,
      equipement: 'aucun',
      zone_corps: 'membres_sup|core',
      contre_indications: 'épaule',
      description_courte: 'Pompes standard au sol.',
      description_vocale: 'Corps droit, mains à largeur des épaules. Descendez la poitrine au sol, remontez en contrôle.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: '20-30',
      frequence: '2-3x/semaine',
      variantes: 'Pompes serrées — Archer — Un bras — Cobra — Explosives'
    },
    {
      id: 'ex-016',
      nom: 'Pompes Archer',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 3,
      equipement: 'aucun',
      zone_corps: 'membres_sup|core',
      contre_indications: 'épaule',
      description_courte: 'Pompes avec un bras tendu sur le côté, charge unilatérale.',
      description_vocale: 'En position de pompe, un bras tendu sur le côté. Descendez vers le bras plié, remontez. Alternez les côtés.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: '8-12',
      frequence: '2-3x/semaine',
      variantes: 'Shifting latéral — Circulaire'
    },
    {
      id: 'ex-017',
      nom: 'Pompes explosives',
      categorie: 'puissance',
      source: 'programme_MA',
      niveau: 4,
      equipement: 'aucun',
      zone_corps: 'membres_sup|core',
      contre_indications: 'épaule|cou',
      description_courte: 'Pompes avec phase concentrique explosive — mains décollent du sol.',
      description_vocale: 'Pompe normale, puis poussez de façon explosive pour décoller les mains. Atterrissage contrôlé.',
      duree_defaut: '',
      series_defaut: 5,
      reps_defaut: 3,
      frequence: '1-2x/semaine',
      variantes: 'Concentriques rapides — Pump reps — Palm Raise — Hands off'
    },

    // ══════════════════════════════════════════
    // ARTS MARTIAUX — Rows (Tirages)
    // ══════════════════════════════════════════
    {
      id: 'ex-018',
      nom: 'Tirage incliné debout (Incline Rows)',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'barre|table',
      zone_corps: 'dos|membres_sup',
      contre_indications: 'épaule',
      description_courte: 'Tirage avec le corps incliné, pieds au sol. Version débutant.',
      description_vocale: 'Accrochez une barre ou le bord d\'une table. Corps incliné à 45 degrés. Tirez la poitrine vers la barre, redescendez.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: '10-15',
      frequence: '2-3x/semaine',
      variantes: 'Isométrique 10s+ — Shifting — Twisting torso — Archer — Circulaire'
    },
    {
      id: 'ex-019',
      nom: 'Tirage jambes tendues (Straight Leg Rows)',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 3,
      equipement: 'barre',
      zone_corps: 'dos|membres_sup',
      contre_indications: 'épaule',
      description_courte: 'Tirage horizontal jambes tendues, corps presque parallèle au sol.',
      description_vocale: 'Barre à hauteur de hanche. Corps horizontal, jambes tendues. Tirez la poitrine vers la barre.',
      duree_defaut: '',
      series_defaut: 3,
      reps_defaut: '10-15',
      frequence: '2-3x/semaine',
      variantes: 'Un bras — Pieds surélevés — Explosif — Accéléré'
    },

    // ══════════════════════════════════════════
    // ARTS MARTIAUX — Fentes (Lunges)
    // ══════════════════════════════════════════
    {
      id: 'ex-020',
      nom: 'Fentes stationnaires (Stationary Lunges)',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 2,
      equipement: 'aucun',
      zone_corps: 'jambes|fessiers',
      contre_indications: '',
      description_courte: 'Fentes en place, un pied devant l\'autre, descente contrôlée.',
      description_vocale: 'Un pied devant, l\'autre derrière. Descendez le genou arrière vers le sol. Remontez en poussant sur le talon avant.',
      duree_defaut: '',
      series_defaut: 4,
      reps_defaut: '20-40',
      frequence: '2-3x/semaine',
      variantes: 'Isométrique 10s+ — Marche — Twist — Overhead — Shifting',
      bilateral: true
    },
    {
      id: 'ex-021',
      nom: 'Fentes sautées (Jump Lunges)',
      categorie: 'puissance',
      source: 'programme_MA',
      niveau: 4,
      equipement: 'aucun',
      zone_corps: 'jambes|fessiers',
      contre_indications: 'dos',
      description_courte: 'Fentes avec saut et changement de jambe en l\'air.',
      description_vocale: 'En fente, sautez et changez de jambe en l\'air. Atterrissez en fente sur l\'autre côté. Contrôle à l\'atterrissage.',
      duree_defaut: '',
      series_defaut: 5,
      reps_defaut: 6,
      frequence: '1-2x/semaine',
      variantes: 'Split squats accélérés — Pump split squats'
    },

    // ══════════════════════════════════════════
    // ARTS MARTIAUX — Leg Raises (Core / Hanche)
    // ══════════════════════════════════════════
    {
      id: 'ex-022',
      nom: 'Hollow Body Hold',
      categorie: 'gainage',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'tapis',
      zone_corps: 'core',
      contre_indications: 'dos',
      description_courte: 'Position de banana — bas du dos collé au sol, jambes et épaules légèrement levées.',
      description_vocale: 'Sur le dos, bas du dos collé au sol. Levez légèrement les jambes et les épaules. Maintenez la tension dans le core.',
      duree_defaut: 20,
      series_defaut: 3,
      reps_defaut: '',
      frequence: '2-3x/semaine',
      variantes: 'Isométrique 20-30 sec'
    },
    {
      id: 'ex-023',
      nom: 'Levées de jambes au sol',
      categorie: 'gainage',
      source: 'programme_MA',
      niveau: 2,
      equipement: 'tapis',
      zone_corps: 'core|hanches',
      contre_indications: 'dos',
      description_courte: 'Levées de jambes tendues au sol.',
      description_vocale: 'Sur le dos, mains sous les fessiers. Jambes tendues, levez-les jusqu\'à 90 degrés, redescendez sans toucher le sol.',
      duree_defaut: '',
      series_defaut: 4,
      reps_defaut: '15-30',
      frequence: '2-3x/semaine',
      variantes: 'Latérales — Alternées — Circulaires'
    },
    {
      id: 'ex-024',
      nom: 'Levées de jambes à la barre (Hanging Leg Raises)',
      categorie: 'gainage',
      source: 'programme_MA',
      niveau: 4,
      equipement: 'barre',
      zone_corps: 'core|hanches',
      contre_indications: 'épaule',
      description_courte: 'Suspendu à une barre, lever les genoux ou les jambes tendues.',
      description_vocale: 'Suspendu à la barre. Levez les genoux vers la poitrine, ou jambes tendues à l\'horizontal. Contrôle tout au long du mouvement.',
      duree_defaut: '',
      series_defaut: 4,
      reps_defaut: '15-30',
      frequence: '2-3x/semaine',
      variantes: 'Genoux — Jambes tendues — Avec pause 2-3 sec — Explosives'
    },

    // ══════════════════════════════════════════
    // ARTS MARTIAUX — Accessoires & Conditionnement
    // ══════════════════════════════════════════
    {
      id: 'ex-025',
      nom: 'Corde à sauter',
      categorie: 'cardio',
      source: 'programme_MA',
      niveau: 2,
      equipement: 'corde',
      zone_corps: 'full_body',
      contre_indications: '',
      description_courte: 'Corde à sauter pour conditionnement cardiovasculaire et coordination.',
      description_vocale: 'Sautez à la corde à rythme régulier. Gardez les coudes près du corps.',
      duree_defaut: 300,
      series_defaut: '',
      reps_defaut: '',
      frequence: '2-3x/semaine',
      variantes: 'Genoux hauts — Intervalles 90s travail / 30s repos'
    },
    {
      id: 'ex-026',
      nom: 'Pendaison à la barre pour le grip',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'barre',
      zone_corps: 'membres_sup|dos',
      contre_indications: 'épaule',
      description_courte: 'Tenir suspendu à une barre, serviette ou grip neutre.',
      description_vocale: 'Saisissez la barre. Suspendez-vous et maintenez le plus longtemps possible. Épaules engagées, ne pas relâcher passivement.',
      duree_defaut: 30,
      series_defaut: 3,
      reps_defaut: '',
      frequence: '2-3x/semaine',
      variantes: 'Serviette pour grip'
    },
    {
      id: 'ex-027',
      nom: 'Levées de jambe pour les hanches (Hip Raises)',
      categorie: 'renforcement',
      source: 'programme_MA',
      niveau: 2,
      equipement: 'aucun',
      zone_corps: 'hanches|fessiers',
      contre_indications: '',
      description_courte: 'Lever et maintenir la jambe en avant, côté et arrière.',
      description_vocale: 'Debout sur un pied. Levez la jambe libre devant, tenez 5 secondes. Puis sur le côté, tenez 5 secondes. Puis derrière, tenez 5 secondes. Répétez.',
      duree_defaut: '',
      series_defaut: 2,
      reps_defaut: 10,
      frequence: '2-3x/semaine',
      variantes: 'Balancement avant-arrière — Côté'
    },

    // ══════════════════════════════════════════
    // ÉCHAUFFEMENT / MOBILITÉ
    // ══════════════════════════════════════════
    {
      id: 'ex-028',
      nom: 'Cercles de bras',
      categorie: 'echauffement',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'aucun',
      zone_corps: 'épaules',
      contre_indications: '',
      description_courte: 'Rotations des bras vers l\'avant et vers l\'arrière.',
      description_vocale: 'Bras tendus sur les côtés. Faites des cercles de plus en plus grands, vers l\'avant puis vers l\'arrière.',
      duree_defaut: '',
      series_defaut: 2,
      reps_defaut: 15,
      frequence: 'avant chaque séance',
      variantes: ''
    },
    {
      id: 'ex-029',
      nom: 'Rotations du tronc',
      categorie: 'echauffement',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'aucun',
      zone_corps: 'dos|core',
      contre_indications: '',
      description_courte: 'Rotations du torse de gauche à droite, bras écartés.',
      description_vocale: 'Pieds à largeur des hanches, bras légèrement tendus. Tournez le torse de gauche à droite en contrôle.',
      duree_defaut: '',
      series_defaut: 2,
      reps_defaut: 15,
      frequence: 'avant chaque séance',
      variantes: ''
    },
    {
      id: 'ex-030',
      nom: 'Frogger Stretch',
      categorie: 'mobilite',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'tapis',
      zone_corps: 'hanches|jambes',
      contre_indications: '',
      description_courte: 'En quadrupédie, ouvrir les genoux vers l\'extérieur et s\'asseoir vers l\'arrière.',
      description_vocale: 'À quatre pattes, écartez les genoux et ramenez les hanches vers les talons. Alternez avant et arrière.',
      duree_defaut: '',
      series_defaut: 2,
      reps_defaut: 15,
      frequence: 'avant chaque séance',
      variantes: ''
    },
    {
      id: 'ex-031',
      nom: 'Genoux hauts en marche',
      categorie: 'echauffement',
      source: 'programme_MA',
      niveau: 1,
      equipement: 'aucun',
      zone_corps: 'hanches|jambes|core',
      contre_indications: '',
      description_courte: 'Marche avec genoux levés haut, bras opposés.',
      description_vocale: 'Marchez en levant alternativement les genoux à hauteur de hanche. Balancez les bras de façon opposée.',
      duree_defaut: '',
      series_defaut: 1,
      reps_defaut: 20,
      frequence: 'avant chaque séance',
      variantes: 'Isométrique avec cercles de bras lents'
    },

    // ══════════════════════════════════════════
    // ÉCHAUFFEMENT — Rotations (PHYSIO_BASE)
    // ══════════════════════════════════════════
    {
      id: 'ex-032', nom: 'Rotations des épaules', categorie: 'echauffement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Rotations des épaules vers l\'avant puis vers l\'arrière.',
      description_vocale: 'Rotations des épaules. Avant puis arrière, grands cercles.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-033', nom: 'Grande rotation des bras', categorie: 'echauffement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Grande rotation des bras vers l\'arrière puis vers l\'avant, amplitude maximale.',
      description_vocale: 'Grande rotation des bras. Arrière puis avant, amplitude maximale.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-034', nom: 'Rotation des avant-bras', categorie: 'echauffement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'membres_sup',
      contre_indications: '',
      description_courte: 'Rotation des avant-bras gauche puis droite, coude fixe.',
      description_vocale: 'Rotation des avant-bras. Gauche puis droite, coude fixe.',
      duree_defaut: 20, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-035', nom: 'Rotation des poignets', categorie: 'echauffement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'membres_sup',
      contre_indications: '',
      description_courte: 'Rotation des poignets vers l\'avant puis vers l\'arrière en alternance.',
      description_vocale: 'Rotation des poignets avant puis arrière en alterné.',
      duree_defaut: 20, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-036', nom: 'Rotation des hanches', categorie: 'echauffement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'hanches',
      contre_indications: '',
      description_courte: 'Grands cercles des hanches gauche puis droite.',
      description_vocale: 'Rotation des hanches. Gauche puis droite, grands cercles.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-037', nom: 'Rotation du tronc', categorie: 'echauffement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'dos|core',
      contre_indications: '',
      description_courte: 'Rotation du tronc, avant-bras balancent, bassin fixe.',
      description_vocale: 'Rotation du tronc. Avant-bras balancent, bassin fixe.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: 'Avec coudes — accentue chaque côté'
    },
    {
      id: 'ex-038', nom: 'Étirement des flancs', categorie: 'echauffement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'dos|core',
      contre_indications: '',
      description_courte: 'Bras levé, inclinaison latérale gauche puis droite.',
      description_vocale: 'Étirement des flancs. Bras levé, gauche puis droite.',
      duree_defaut: 20, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },

    // ══════════════════════════════════════════
    // MOBILITÉ (PHYSIO_BASE)
    // ══════════════════════════════════════════
    {
      id: 'ex-039', nom: 'Cat-cow lent', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'dos|core',
      contre_indications: '',
      description_courte: 'À quatre pattes, arrondir et creuser le dos en suivant la respiration.',
      description_vocale: 'Chat-vache lent. Expire en arrondissant, inspire en creusant.',
      duree_defaut: 60, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-040', nom: 'Thread the needle — gauche', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'dos|épaules',
      contre_indications: 'épaule',
      description_courte: 'En quadrupédie, glisser le bras gauche sous le corps, épaule vers le sol.',
      description_vocale: 'Thread the needle côté gauche. Bras sous le corps, épaule vers le sol.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: 'Thread the needle — droite'
    },
    {
      id: 'ex-041', nom: 'Thread the needle — droite', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'dos|épaules',
      contre_indications: 'épaule',
      description_courte: 'En quadrupédie, glisser le bras droit sous le corps, épaule vers le sol.',
      description_vocale: 'Thread the needle côté droit. Même chose à droite.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-042', nom: 'Rotation thoracique assis', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'chaise', zone_corps: 'dos',
      contre_indications: '',
      description_courte: 'Assis, mains sur les épaules, pivoter le buste gauche et droite, bassin fixe.',
      description_vocale: 'Rotation thoracique assis. Mains sur épaules, pivote le buste, bassin fixe.',
      duree_defaut: 40, series_defaut: 2, reps_defaut: '', frequence: 'avant chaque séance', variantes: '3e série — amplitude maximale'
    },
    {
      id: 'ex-043', nom: 'Demi-cercle cervical — gauche', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'cou',
      contre_indications: 'cou',
      description_courte: 'Menton vers la poitrine, glisser l\'oreille vers l\'épaule gauche. Ne pas aller vers l\'arrière.',
      description_vocale: 'Demi-cercle cervical gauche. Menton vers poitrine, glisse vers l\'épaule gauche. Ne pas aller vers l\'arrière.',
      duree_defaut: 20, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: 'Demi-cercle cervical — droite'
    },
    {
      id: 'ex-044', nom: 'Demi-cercle cervical — droite', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'cou',
      contre_indications: 'cou',
      description_courte: 'Menton vers la poitrine, glisser l\'oreille vers l\'épaule droite.',
      description_vocale: 'Demi-cercle cervical droit. Glisse vers l\'épaule droite.',
      duree_defaut: 20, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },
    {
      id: 'ex-045', nom: 'Étirement cou latéral — gauche', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'cou',
      contre_indications: 'cou',
      description_courte: 'Oreille vers l\'épaule gauche, main sur la tempe pour accentuer.',
      description_vocale: 'Étirement latéral du cou gauche. Oreille vers l\'épaule, main sur la tempe.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: 'Étirement cou latéral — droite'
    },
    {
      id: 'ex-046', nom: 'Étirement cou latéral — droite', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'cou',
      contre_indications: 'cou',
      description_courte: 'Oreille vers l\'épaule droite, main sur la tempe pour accentuer.',
      description_vocale: 'Étirement latéral du cou droit. Même chose à droite.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque séance', variantes: ''
    },

    // ══════════════════════════════════════════
    // RENFORCEMENT DE BASE (RENFO_BASE)
    // ══════════════════════════════════════════
    {
      id: 'ex-047', nom: 'Planche complète', categorie: 'gainage', source: 'programme_physio',
      niveau: 2, equipement: 'tapis', zone_corps: 'core|épaules',
      contre_indications: 'épaule',
      description_courte: 'Corps droit des talons à la tête, maintien isométrique.',
      description_vocale: 'Planche complète. Corps droit des talons à la tête.',
      duree_defaut: 35, series_defaut: 3, reps_defaut: '', frequence: '2-3x/semaine', variantes: 'Planche sur genoux — version allégée'
    },
    {
      id: 'ex-048', nom: 'Bird-dog', categorie: 'gainage', source: 'programme_physio',
      niveau: 2, equipement: 'tapis', zone_corps: 'core|dos',
      contre_indications: '',
      description_courte: 'À quatre pattes, bras gauche et jambe droite tendus, maintenir 5 secondes, alterner.',
      description_vocale: 'Bird-dog. Bras gauche et jambe droite tendus, maintiens cinq secondes, alterne.',
      duree_defaut: 60, series_defaut: 2, reps_defaut: '', frequence: '2-3x/semaine', variantes: ''
    },
    {
      id: 'ex-049', nom: 'Pont fessier', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'fessiers|core',
      contre_indications: 'dos',
      description_courte: 'Sur le dos, monter les hanches, serrer les fessiers, maintenir 3 secondes.',
      description_vocale: 'Pont fessier. Monte, serre les fessiers, maintiens trois secondes.',
      duree_defaut: 50, series_defaut: 3, reps_defaut: '', frequence: '2-3x/semaine', variantes: 'Pont fessier unilatéral'
    },
    {
      id: 'ex-050', nom: 'Dead bug', categorie: 'gainage', source: 'programme_physio',
      niveau: 2, equipement: 'tapis', zone_corps: 'core',
      contre_indications: 'dos',
      description_courte: 'Sur le dos, descendre bras droit et jambe gauche sans décoller le bas du dos, alterner.',
      description_vocale: 'Dead bug. Sur le dos, descends bras droit et jambe gauche sans décoller le bas du dos.',
      duree_defaut: 50, series_defaut: 2, reps_defaut: '', frequence: '2-3x/semaine', variantes: ''
    },
    {
      id: 'ex-051', nom: 'Chin tuck', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'cou',
      contre_indications: '',
      description_courte: 'Assis droit, ramener le menton vers l\'arrière, maintenir 3 secondes.',
      description_vocale: 'Chin tuck. Ramène le menton vers l\'arrière, maintiens trois secondes.',
      duree_defaut: 45, series_defaut: 2, reps_defaut: '', frequence: '2-3x/semaine|aux 1-2h', variantes: 'Rétraction cervicale répétée (sans maintien)'
    },
    {
      id: 'ex-052', nom: 'Gainage latéral', categorie: 'gainage', source: 'programme_physio',
      niveau: 2, equipement: 'tapis', zone_corps: 'core',
      contre_indications: 'épaule',
      description_courte: 'Sur le côté, hanche décollée, corps aligné. Maintien isométrique.',
      description_vocale: 'Gainage latéral. Hanche décollée, corps aligné.',
      duree_defaut: 20, series_defaut: 2, reps_defaut: '', frequence: '2-3x/semaine', variantes: 'Sur les genoux — version allégée',
      bilateral: true
    },

    // ══════════════════════════════════════════
    // COIFFE DES ROTATEURS
    // ══════════════════════════════════════════
    {
      id: 'ex-053', nom: 'Rotation externe — gauche', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'élastique', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Coude à 90° collé au corps, rotation externe avec élastique, bras gauche.',
      description_vocale: 'Rotation externe, bras gauche. Coude à 90° collé au corps, bande élastique, tourne vers l\'extérieur lentement.',
      duree_defaut: 45, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: ''
    },
    {
      id: 'ex-054', nom: 'Rotation externe — droite', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'élastique', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Coude à 90° collé au corps, rotation externe avec élastique, bras droit. Doux sur l\'épaule droite.',
      description_vocale: 'Rotation externe, bras droit. Même mouvement — reste doux sur l\'épaule droite.',
      duree_defaut: 45, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: ''
    },
    {
      id: 'ex-055', nom: 'Rotation interne — gauche', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'élastique', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Coude à 90° collé au corps, rotation interne avec élastique, bras gauche.',
      description_vocale: 'Rotation interne, bras gauche. Coude à 90°, tourne vers l\'intérieur.',
      duree_defaut: 45, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: ''
    },
    {
      id: 'ex-056', nom: 'Rotation interne — droite', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'élastique', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Coude à 90° collé au corps, rotation interne avec élastique, bras droit. Doux.',
      description_vocale: 'Rotation interne, bras droit. Doux, surveille la douleur.',
      duree_defaut: 45, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: ''
    },
    {
      id: 'ex-057', nom: 'Élévation latérale — gauche', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'élastique', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Bras à 90°, pouce vers le bas (vider la canette), élévation latérale gauche.',
      description_vocale: 'Élévation latérale gauche. Bras à 90°, pouce vers le bas — vider la canette. Monte lentement.',
      duree_defaut: 40, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: ''
    },
    {
      id: 'ex-058', nom: 'Élévation latérale — droite', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'élastique', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Bras à 90°, pouce vers le bas, élévation latérale droite. Doux sur l\'épaule droite.',
      description_vocale: 'Élévation latérale droite. Même mouvement côté droit. Doux sur l\'épaule droite.',
      duree_defaut: 40, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: ''
    },
    {
      id: 'ex-059', nom: 'Trapèzes en Y', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'épaules|dos',
      contre_indications: 'épaule',
      description_courte: 'Allongé sur le ventre, lever les bras en Y, pouces vers le haut.',
      description_vocale: 'Renforcement trapèzes en Y. Allongé sur le ventre, lève les bras en Y. Pouces vers le haut.',
      duree_defaut: 40, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: 'Trapèzes en T — bras en croix'
    },
    {
      id: 'ex-060', nom: 'Trapèzes en T', categorie: 'renforcement', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'épaules|dos',
      contre_indications: 'épaule',
      description_courte: 'Allongé sur le ventre, lever les bras en T (bras en croix), pouces vers le haut.',
      description_vocale: 'Renforcement trapèzes en T. Même position, bras en croix.',
      duree_defaut: 40, series_defaut: 1, reps_defaut: '', frequence: '4x/semaine', variantes: ''
    },

    // ══════════════════════════════════════════
    // RETOUR AU CALME (COOLDOWN)
    // ══════════════════════════════════════════
    {
      id: 'ex-061', nom: 'Enfant étendu', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'dos|épaules',
      contre_indications: 'épaule',
      description_courte: 'Sur les genoux, bras tendus devant, front au sol, relâcher le dos. Appui sur avant-bras si épaule sensible.',
      description_vocale: 'Enfant étendu sur les coudes. Appuie-toi sur tes avant-bras au lieu des mains — protège l\'épaule droite. Relâche le dos.',
      duree_defaut: 60, series_defaut: 1, reps_defaut: '', frequence: 'après chaque séance', variantes: 'Sur les coudes — protège l\'épaule droite'
    },
    {
      id: 'ex-062', nom: 'Torsion allongée', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'dos|hanches',
      contre_indications: '',
      description_courte: 'Sur le dos, genou basculé d\'un côté, bras en croix, regard vers le côté opposé.',
      description_vocale: 'Torsion allongée. Genou basculé, bras en croix. Gauche puis droite.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'après chaque séance', variantes: 'Torsion allongée — gauche|Torsion allongée — droite',
      bilateral: true
    },
    {
      id: 'ex-063', nom: 'Étirement scalènes', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'cou',
      contre_indications: 'cou',
      description_courte: 'Oreille vers l\'épaule, menton vers le plafond. Étire les muscles latéraux du cou.',
      description_vocale: 'Étirement des scalènes. Oreille vers l\'épaule, menton vers le plafond. Gauche puis droite.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'après chaque séance', variantes: 'Scalènes — gauche|Scalènes — droite',
      bilateral: true
    },
    {
      id: 'ex-064', nom: 'Ischio-jambiers', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'jambes',
      contre_indications: 'dos',
      description_courte: 'Sur le dos, jambe tendue, mains derrière la cuisse. Étirer les ischio-jambiers.',
      description_vocale: 'Ischio-jambiers. Sur le dos, jambe tendue, mains derrière la cuisse. Gauche puis droite.',
      duree_defaut: 30, series_defaut: 1, reps_defaut: '', frequence: 'après chaque séance', variantes: 'Ischio-jambiers — gauche|Ischio-jambiers — droite',
      bilateral: true
    },
    {
      id: 'ex-065', nom: 'Shavasana', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'tapis', zone_corps: 'full_body',
      contre_indications: '',
      description_courte: 'Allongé sur le dos, paumes vers le haut. Relâchement total, respiration lente.',
      description_vocale: 'Shavasana. Allonge-toi, paumes vers le haut. Relâche. Respiration lente. Bravo pour cette séance.',
      duree_defaut: 90, series_defaut: 1, reps_defaut: '', frequence: 'après chaque séance', variantes: ''
    },

    // ══════════════════════════════════════════
    // SPÉCIAUX — MERCREDI (Mobilité & Récupération)
    // ══════════════════════════════════════════
    {
      id: 'ex-066', nom: 'Mobilité thoracique — rotation', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'chaise', zone_corps: 'dos',
      contre_indications: '',
      description_courte: 'Assis, mains derrière la tête, pivoter lentement gauche et droite, amplitude maximale.',
      description_vocale: 'Mobilité thoracique supplémentaire. Assis, mains derrière la tête, pivote lentement gauche et droite.',
      duree_defaut: 60, series_defaut: 1, reps_defaut: '', frequence: '1x/semaine', variantes: ''
    },
    {
      id: 'ex-067', nom: 'Mobilité thoracique — extension', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'chaise', zone_corps: 'dos',
      contre_indications: '',
      description_courte: 'Assis, mains derrière la tête, ouvrir la poitrine vers le haut.',
      description_vocale: 'Extension thoracique. Assis sur une chaise, mains derrière la tête, ouvre la poitrine vers le haut.',
      duree_defaut: 45, series_defaut: 1, reps_defaut: '', frequence: '1x/semaine', variantes: ''
    },
    {
      id: 'ex-068', nom: 'Étirement pectoraux', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'membres_sup|épaules',
      contre_indications: 'épaule',
      description_courte: 'Bras en croix contre un cadre de porte, avancer doucement pour ouvrir la poitrine.',
      description_vocale: 'Étirement des pectoraux. Bras en croix contre un cadre de porte, avance doucement.',
      duree_defaut: 40, series_defaut: 2, reps_defaut: '', frequence: '1x/semaine', variantes: ''
    },
    {
      id: 'ex-069', nom: 'Pendule de Codman', categorie: 'mobilite', source: 'programme_physio',
      niveau: 1, equipement: 'aucun', zone_corps: 'épaules',
      contre_indications: 'épaule',
      description_courte: 'Penché en avant, bras suspendu, petit cercle doux pour décoapter l\'épaule.',
      description_vocale: 'Pendule de Codman. Penché en avant, bras suspendu — laisse le poids décoapter l\'épaule. Petit cercle sans forcer.',
      duree_defaut: 60, series_defaut: 2, reps_defaut: '', frequence: '1-2x/semaine', variantes: 'Sens horaire puis anti-horaire'
    },

    // ══════════════════════════════════════════
    // ÉCHAUFFEMENT KUNG FU — Bas du corps (sections 4-6)
    // Source : Echauffement_Kung_Fu.md (pratique personnelle Wing Chun)
    // ══════════════════════════════════════════
    {
      id: 'ex-070', nom: 'Position cavalier gauche', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'hanches|jambes',
      contre_indications: '',
      description_courte: 'Position cavalier gauche, dos droit puis descente progressive.',
      description_vocale: 'Position cavalier gauche. Hanche gauche ouverte, dos bien vertical. Maintiens cinq secondes. Descends progressivement.',
      duree_defaut: 10, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-071', nom: 'Descente laterale gauche', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'hanches|jambes|aine',
      contre_indications: '',
      description_courte: 'Genou droit flechi, jambe gauche tendue sur le cote, aine gauche etirée.',
      description_vocale: 'Descente sur jambe droite. Jambe gauche tendue sur le cote. Maintiens cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-072', nom: 'Low lunge gauche', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'hanches|jambes|aine',
      contre_indications: '',
      description_courte: 'Pied gauche devant, genou a 90 degres, hanche vers le sol.',
      description_vocale: 'Low lunge gauche. Pied gauche devant, genou a 90 degres, hanche vers le sol. Cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-073', nom: 'Position cavalier droite', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'hanches|jambes',
      contre_indications: '',
      description_courte: 'Position cavalier droite, dos droit puis descente progressive.',
      description_vocale: 'Position cavalier droit. Meme enchainement cote droit. Maintiens cinq secondes.',
      duree_defaut: 10, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-074', nom: 'Descente laterale droite', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'hanches|jambes|aine',
      contre_indications: '',
      description_courte: 'Genou gauche flechi, jambe droite tendue sur le cote, aine droite etirée.',
      description_vocale: 'Descente sur jambe gauche. Jambe droite tendue sur le cote. Cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-075', nom: 'Low lunge droit', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'hanches|jambes|aine',
      contre_indications: '',
      description_courte: 'Pied droit devant, genou a 90 degres, hanche vers le sol.',
      description_vocale: 'Low lunge droit. Pied droit devant, genou a 90 degres, hanche vers le sol. Cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-076', nom: 'Balancement vers les pieds', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'ischio-jambiers|dos',
      contre_indications: '',
      description_courte: 'Corps souple, balancement gauche-droite vers les pieds, bras suivent.',
      description_vocale: 'Balancement vers les pieds. Corps souple, bras suivent le mouvement. Cinq fois.',
      duree_defaut: 10, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-077', nom: 'Tenir pied gauche', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'ischio-jambiers',
      contre_indications: '',
      description_courte: 'Jambe tendue, tenir le pied gauche cinq secondes.',
      description_vocale: 'Tenir pied gauche. Jambe tendue, maintiens cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-078', nom: 'Tenir pied droit', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'ischio-jambiers',
      contre_indications: '',
      description_courte: 'Jambe tendue, tenir le pied droit cinq secondes.',
      description_vocale: 'Tenir pied droit. Meme chose a droite. Cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-079', nom: 'Agripper orteils et cheville gauche', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'ischio-jambiers|chevilles',
      contre_indications: '',
      description_courte: 'Orteils vers soi 5s, puis cheville 5s, jambe gauche.',
      description_vocale: 'Agripper orteils gauche. Orteils vers toi, jambe tendue, cinq secondes. Puis agripper la cheville, cinq secondes.',
      duree_defaut: 10, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-080', nom: 'Agripper orteils et cheville droit', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'ischio-jambiers|chevilles',
      contre_indications: '',
      description_courte: 'Orteils vers soi 5s, puis cheville 5s, jambe droite.',
      description_vocale: 'Meme chose a droite. Orteils vers toi, cinq secondes. Cheville, cinq secondes.',
      duree_defaut: 10, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-081', nom: 'Descente fesses vers talons', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'genoux|chevilles|bas du dos',
      contre_indications: 'genoux',
      description_courte: 'Dos droit, descente fesses vers les talons.',
      description_vocale: 'Descente fesses vers les talons. Dos droit, descends lentement. Cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    },
    {
      id: 'ex-082', nom: 'Pince debout', categorie: 'echauffement', source: 'programme_MA',
      niveau: 1, equipement: 'aucun', zone_corps: 'ischio-jambiers|bas du dos',
      contre_indications: '',
      description_courte: 'Jambes tendues, mains vers les pieds, 5 secondes.',
      description_vocale: 'Pince debout. Jambes tendues, mains vers les pieds. Laisse la gravite travailler. Cinq secondes.',
      duree_defaut: 5, series_defaut: 1, reps_defaut: '', frequence: 'avant chaque seance', variantes: ''
    }

  ];

  exercices.forEach(function (ex) { upsertRow('Exercices', ex); });
  return { ok: true, count: exercices.length, message: exercices.length + ' exercices dans la banque (upsert).' };
}

// =================================================================
// SETUP
// =================================================================
function saveProgrammeJour(p) {
  var jour = JSON.parse(p.jour);
  upsertRow('Programme', jour);
  return { ok: true };
}

function seedProgramme() {
  var jours = [
    { jour: 0, label: 'Lundi',    type: 'Renforcement A — Planche + Coiffe',         couleur: '#1D9E75',
      exercices_json: JSON.stringify([
        {id:'ex-047', series:3, duree:35, pause:20},
        {id:'ex-048', series:2, duree:60, pause:20},
        {id:'ex-053', series:1, duree:45, pause:10},
        {id:'ex-054', series:1, duree:45, pause:10},
        {id:'ex-055', series:1, duree:45, pause:10},
        {id:'ex-056', series:1, duree:45, pause:10},
        {id:'ex-057', series:1, duree:40, pause:10},
        {id:'ex-058', series:1, duree:40, pause:10},
        {id:'ex-059', series:1, duree:40, pause:10},
        {id:'ex-060', series:1, duree:40, pause:15}
      ])
    },
    { jour: 1, label: 'Mardi',    type: 'Mobilité & Récupération',   couleur: '#BA7517',
      exercices_json: JSON.stringify([
        {id:'ex-068', series:2, duree:40, pause:15},
        {id:'ex-069', series:2, duree:60, pause:15}
      ])
    },
    { jour: 2, label: 'Mercredi', type: 'Récupération active',            couleur: '#27AE60',
      exercices_json: JSON.stringify([
        {id:'marche-douce', series:1, duree:600, pause:20},
        {id:'ex-069', series:2, duree:60, pause:15}
      ])
    },
    { jour: 3, label: 'Jeudi',    type: 'Renforcement B — Pont + Gainage + Coiffe', couleur: '#2980B9',
      exercices_json: JSON.stringify([
        {id:'ex-049', series:3, duree:50, pause:20},
        {id:'ex-050', series:2, duree:50, pause:20},
        {id:'ex-052', series:2, duree:20, pause:10},
        {id:'ex-053', series:1, duree:45, pause:10},
        {id:'ex-054', series:1, duree:45, pause:10},
        {id:'ex-055', series:1, duree:45, pause:10},
        {id:'ex-056', series:1, duree:45, pause:10},
        {id:'ex-057', series:1, duree:40, pause:10},
        {id:'ex-058', series:1, duree:40, pause:10},
        {id:'ex-059', series:1, duree:40, pause:10},
        {id:'ex-060', series:1, duree:40, pause:15}
      ])
    },
    { jour: 4, label: 'Vendredi', type: 'Renforcement C — Chin tuck + Trapèzes', couleur: '#8E44AD',
      exercices_json: JSON.stringify([
        {id:'ex-051', series:2, duree:45, pause:15},
        {id:'ex-052', series:1, duree:20, pause:10},
        {id:'ex-059', series:1, duree:40, pause:10},
        {id:'ex-060', series:1, duree:40, pause:20}
      ])
    },
    { jour: 5, label: 'Samedi',   type: 'Cardio Z2 + Mobilité',               couleur: '#16A085',
      exercices_json: JSON.stringify([
        {id:'tapis-z2', series:1, duree:1200, pause:0},
        {id:'recuperation-cardio', series:1, duree:180, pause:0}
      ])
    },
    { jour: 6, label: 'Dimanche', type: 'Yoga — Iyengar Leçon 1',         couleur: '#888888',
      exercices_json: JSON.stringify([
        {id:'yoga-iyengar-1', series:1, duree:2400, pause:0}
      ])
    }
  ];
  jours.forEach(function(j) { upsertRow('Programme', j); });
  return { ok: true, seeded: jours.length };
}


function setupSheets() {
  Object.keys(SHEETS).forEach(function (name) { getSheet(name); });
  SpreadsheetApp.getUi().alert('Toutes les feuilles ont ete creees');
}
