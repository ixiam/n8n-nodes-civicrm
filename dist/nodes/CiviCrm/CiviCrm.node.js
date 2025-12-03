"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CiviCrm = void 0;
const GenericFunctions_1 = require("../transport/GenericFunctions");
const resources_1 = require("./descriptions/resources");
const generic_1 = require("./descriptions/generic");
const ENTITY_MAP = {
    contact: 'Contact',
    membership: 'Membership',
    group: 'Group',
    relationship: 'Relationship',
    activity: 'Activity',
};
/* ============================================================================
   LOCATION TYPE CACHE
============================================================================ */
let locationTypeCache = null;
function normalizeLocationKey(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}
async function getLocationTypeMap() {
    if (locationTypeCache)
        return locationTypeCache;
    const res = await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/OptionValue/get', {
        where: [['option_group_id:name', '=', 'location_type']],
        select: ['name', 'label'],
        limit: 0,
    });
    const map = {};
    const values = ((res === null || res === void 0 ? void 0 : res.values) || []);
    for (const v of values) {
        const name = v.name || '';
        const label = v.label || '';
        const k1 = normalizeLocationKey(name);
        const k2 = normalizeLocationKey(label);
        if (k1)
            map[k1] = name;
        if (k2)
            map[k2] = name;
    }
    locationTypeCache = map;
    return map;
}
/* ============================================================================
   NODE DEFINITION
============================================================================ */
class CiviCrm {
    constructor() {
        this.description = {
            displayName: 'CiviCRM',
            name: 'civiCrm',
            icon: 'file:civicrm.svg',
            group: ['transform'],
            version: 1,
            description: 'Interact with CiviCRM API v4 (Civi-Go compatible).\n\n' +
                'Supports Contact, Membership, Group, Relationship and Activity entities.\n' +
                'Includes dynamic mapping of email, phone, address and location types.\n' +
                'Includes birth_date validation and JSON filters for GET MANY.\n',
            defaults: { name: 'CiviCRM' },
            inputs: ['main'],
            outputs: ['main'],
            credentials: [{ name: 'civiCrmApi', required: true }],
            properties: [
                //
                // RESOURCE + OPERATION
                //
                resources_1.resourceProp,
                resources_1.operationProp,
                //
                // CONTACT TYPE
                //
                {
                    displayName: 'Contact Type',
                    name: 'contactType',
                    type: 'options',
                    default: 'Individual',
                    options: [
                        { name: 'Individual', value: 'Individual' },
                        { name: 'Organization', value: 'Organization' },
                        { name: 'Household', value: 'Household' },
                    ],
                    displayOptions: { show: { resource: ['contact'] } },
                },
                //
                // LOCATION TYPES
                //
                {
                    displayName: 'Email Location Type',
                    name: 'emailLocation',
                    type: 'options',
                    default: 'Work',
                    options: [
                        { name: 'Home', value: 'Home' },
                        { name: 'Work', value: 'Work' },
                        { name: 'Other', value: 'Other' },
                    ],
                    displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
                },
                {
                    displayName: 'Phone Location Type',
                    name: 'phoneLocation',
                    type: 'options',
                    default: 'Work',
                    options: [
                        { name: 'Home', value: 'Home' },
                        { name: 'Work', value: 'Work' },
                        { name: 'Mobile', value: 'Mobile' },
                        { name: 'Other', value: 'Other' },
                    ],
                    displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
                },
                {
                    displayName: 'Address Location Type',
                    name: 'addressLocation',
                    type: 'options',
                    default: 'Home',
                    options: [
                        { name: 'Home', value: 'Home' },
                        { name: 'Work', value: 'Work' },
                        { name: 'Billing', value: 'Billing' },
                        { name: 'Other', value: 'Other' },
                    ],
                    displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
                },
                //
                // PRIMARY FLAG
                //
                {
                    displayName: 'Mark as Primary',
                    name: 'isPrimary',
                    type: 'boolean',
                    default: true,
                    displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
                },
                //
                // ID for GET / UPDATE / DELETE
                //
                {
                    displayName: 'ID',
                    name: 'id',
                    type: 'number',
                    default: 0,
                    required: true,
                    displayOptions: { show: { operation: ['get', 'update', 'delete'] } },
                },
                //
                // DYNAMIC FIELDS
                //
                ...generic_1.genericFields,
                ...generic_1.upsertFields,
            ],
        };
        /* ============================================================================
           LOAD OPTIONS (required by n8n verification)
        ============================================================================ */
        this.methods = {
            loadOptions: {
                async loadOptionValues() {
                    const { baseUrl, apiToken } = (await this.getCredentials('civiCrmApi'));
                    const res = await this.helpers.httpRequest({
                        method: 'POST',
                        url: `${baseUrl.replace(/\/$/, '')}/civicrm/ajax/api4/OptionValue/get`,
                        headers: {
                            'X-Civi-Auth': `Bearer ${apiToken}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: { params: JSON.stringify({ limit: 50, select: ['id', 'label'] }) },
                        json: true,
                    });
                    const values = ((res === null || res === void 0 ? void 0 : res.values) || []);
                    return values.map((v) => ({
                        name: v.label,
                        value: v.id,
                    }));
                },
            },
        };
    }
    /* ============================================================================
       EXECUTE
    ============================================================================ */
    async execute() {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const items = this.getInputData();
        const out = [];
        const resource = this.getNodeParameter('resource', 0);
        const operation = this.getNodeParameter('operation', 0);
        const entity = ENTITY_MAP[resource];
        for (let i = 0; i < items.length; i++) {
            const emailLocationParam = this.getNodeParameter('emailLocation', i, 'Work');
            const phoneLocationParam = this.getNodeParameter('phoneLocation', i, 'Work');
            const addressLocationParam = this.getNodeParameter('addressLocation', i, 'Home');
            const isPrimary = this.getNodeParameter('isPrimary', i, true);
            let emailLocationName = emailLocationParam;
            let phoneLocationName = phoneLocationParam;
            let addressLocationName = addressLocationParam;
            /* ======================================================
               GET
            ====================================================== */
            if (operation === 'get') {
                const id = this.getNodeParameter('id', i);
                const params = resource === 'contact'
                    ? {
                        where: [['id', '=', id]],
                        limit: 1,
                        select: [
                            'id',
                            'display_name',
                            'first_name',
                            'last_name',
                            'contact_type',
                            'gender_id',
                            'gender_id:name',
                            'birth_date',
                        ],
                        chain: {
                            emails: ['Email', 'get', { where: [['contact_id', '=', '$id']] }],
                            phones: ['Phone', 'get', { where: [['contact_id', '=', '$id']] }],
                            addresses: ['Address', 'get', { where: [['contact_id', '=', '$id']] }],
                        },
                    }
                    : {
                        where: [['id', '=', id]],
                        limit: 1,
                        select: ['id', 'name', 'title', 'subject', 'display_name'],
                    };
                const res = await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', `/civicrm/ajax/api4/${entity}/get`, params);
                out.push({ json: (_b = (_a = res === null || res === void 0 ? void 0 : res.values) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : {} });
                continue;
            }
            /* ======================================================
               GET MANY
            ====================================================== */
            if (operation === 'getMany') {
                const limit = this.getNodeParameter('limit', i, 100);
                const returnAll = this.getNodeParameter('returnAll', i, false);
                const whereJson = this.getNodeParameter('whereJson', i, '');
                let where = [];
                if (whereJson) {
                    try {
                        where = JSON.parse(whereJson);
                    }
                    catch (error) {
                        throw new Error('Invalid JSON in whereJson');
                    }
                }
                if (resource === 'contact') {
                    const contactType = this.getNodeParameter('contactType', i, '');
                    if (contactType)
                        where.push(['contact_type', '=', contactType]);
                }
                const params = resource === 'contact'
                    ? {
                        where,
                        select: [
                            'id',
                            'display_name',
                            'first_name',
                            'last_name',
                            'contact_type',
                            'gender_id',
                            'gender_id:name',
                            'birth_date',
                        ],
                        chain: {
                            emails: ['Email', 'get', { where: [['contact_id', '=', '$id']] }],
                            phones: ['Phone', 'get', { where: [['contact_id', '=', '$id']] }],
                            addresses: ['Address', 'get', { where: [['contact_id', '=', '$id']] }],
                        },
                    }
                    : {
                        where,
                        select: ['id', 'name', 'title', 'subject', 'display_name'],
                    };
                if (returnAll) {
                    let offset = 0;
                    const page = 500;
                    let hasMore = true;
                    while (hasMore) {
                        const r = await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', `/civicrm/ajax/api4/${entity}/get`, { ...params, limit: page, offset });
                        const vals = (_c = r === null || r === void 0 ? void 0 : r.values) !== null && _c !== void 0 ? _c : [];
                        for (const v of vals)
                            out.push({ json: v });
                        if (vals.length < page) {
                            hasMore = false;
                        }
                        else {
                            offset += page;
                        }
                    }
                }
                else {
                    const r = await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', `/civicrm/ajax/api4/${entity}/get`, { ...params, limit });
                    const vals = (_d = r === null || r === void 0 ? void 0 : r.values) !== null && _d !== void 0 ? _d : [];
                    for (const v of vals)
                        out.push({ json: v });
                }
                continue;
            }
            /* ======================================================
               DELETE
            ====================================================== */
            if (operation === 'delete') {
                const id = this.getNodeParameter('id', i);
                const r = await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', `/civicrm/ajax/api4/${entity}/delete`, {
                    where: [['id', '=', id]],
                });
                out.push({
                    json: {
                        success: true,
                        message: `${entity} ${id} deleted`,
                        deleted_id: id,
                        api_response: r,
                    },
                });
                continue;
            }
            /* ======================================================
               CREATE / UPDATE
            ====================================================== */
            const isCreate = operation === 'create';
            const id = !isCreate ? this.getNodeParameter('id', i) : undefined;
            const pairs = this.getNodeParameter('fields.field', i, []);
            const values = {};
            const emailData = {};
            const phoneData = {};
            const addressData = {};
            let locationTypeMap = {};
            if (resource === 'contact') {
                locationTypeMap = await getLocationTypeMap.call(this);
            }
            for (const p of pairs) {
                if (!p.fieldName)
                    continue;
                const key = p.fieldName.trim();
                const rawVal = convertValue(p.fieldValue);
                const val = rawVal;
                /* Email simple */
                if (key === 'email') {
                    emailData.email = val;
                    continue;
                }
                if (key.startsWith('email.')) {
                    emailData[key.replace(/^email\./, '')] = val;
                    continue;
                }
                /* Phone simple */
                if (key === 'phone') {
                    phoneData.phone = val;
                    continue;
                }
                if (key.startsWith('phone.')) {
                    phoneData[key.replace(/^phone\./, '')] = val;
                    continue;
                }
                /* Address */
                if (key.startsWith('address.')) {
                    addressData[key.replace(/^address\./, '')] = val;
                    continue;
                }
                /* Prefijo dinámico */
                const segments = key.split('.');
                if (segments.length >= 2 && resource === 'contact') {
                    const prefixRaw = segments[0];
                    const root = segments[1];
                    const subfield = segments.slice(2).join('.') || '';
                    const normalizedPrefix = normalizeLocationKey(prefixRaw);
                    const mappedLocationName = locationTypeMap[normalizedPrefix];
                    if (root === 'email' || root === 'phone' || root === 'address') {
                        if (mappedLocationName) {
                            if (root === 'email')
                                emailLocationName = mappedLocationName;
                            if (root === 'phone')
                                phoneLocationName = mappedLocationName;
                            if (root === 'address')
                                addressLocationName = mappedLocationName;
                        }
                        if (root === 'email') {
                            if (!subfield)
                                emailData.email = val;
                            else
                                emailData[subfield] = val;
                            continue;
                        }
                        if (root === 'phone') {
                            if (!subfield)
                                phoneData.phone = val;
                            else
                                phoneData[subfield] = val;
                            continue;
                        }
                        if (root === 'address') {
                            if (subfield)
                                addressData[subfield] = val;
                            continue;
                        }
                    }
                }
                /* gender */
                if (key === 'gender' || key === 'gender_id') {
                    values.gender_id = val;
                    continue;
                }
                /* birth_date */
                if (key === 'birth_date' || key === 'birth') {
                    values.birth_date = normalizeBirthDate(String(val));
                    continue;
                }
                /* default */
                values[key] = val;
            }
            /* Contact type */
            const contactType = this.getNodeParameter('contactType', i, '');
            if (resource === 'contact' && contactType) {
                values.contact_type = contactType;
            }
            /* CREATE/UPDATE contact */
            let contactId = id;
            if (isCreate) {
                const r = await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Contact/create', { values });
                contactId = (_f = (_e = r === null || r === void 0 ? void 0 : r.values) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.id;
                if (!contactId)
                    throw new Error('Failed to create contact.');
            }
            else {
                await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', `/civicrm/ajax/api4/${entity}/update`, {
                    values,
                    where: [['id', '=', contactId]],
                });
            }
            /* SUBENTITIES */
            if (resource === 'contact') {
                if (isPrimary) {
                    await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Email/delete', {
                        where: [
                            ['contact_id', '=', contactId],
                            ['is_primary', '=', true],
                        ],
                    });
                    await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Phone/delete', {
                        where: [
                            ['contact_id', '=', contactId],
                            ['is_primary', '=', true],
                        ],
                    });
                    await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Address/delete', {
                        where: [
                            ['contact_id', '=', contactId],
                            ['is_primary', '=', true],
                        ],
                    });
                }
                if (Object.keys(emailData).length) {
                    await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Email/create', {
                        values: {
                            ...emailData,
                            contact_id: contactId,
                            is_primary: isPrimary,
                            'location_type_id:name': emailLocationName,
                        },
                    });
                }
                if (Object.keys(phoneData).length) {
                    await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Phone/create', {
                        values: {
                            ...phoneData,
                            contact_id: contactId,
                            is_primary: isPrimary,
                            'location_type_id:name': phoneLocationName,
                        },
                    });
                }
                if (Object.keys(addressData).length) {
                    await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Address/create', {
                        values: {
                            ...addressData,
                            contact_id: contactId,
                            is_primary: isPrimary,
                            'location_type_id:name': addressLocationName,
                        },
                    });
                }
            }
            /* FINAL GET */
            const res = await GenericFunctions_1.civicrmApiRequest.call(this, 'POST', `/civicrm/ajax/api4/${entity}/get`, {
                where: [['id', '=', contactId]],
                select: [
                    'id',
                    'display_name',
                    'first_name',
                    'last_name',
                    'contact_type',
                    'gender_id',
                    'gender_id:name',
                    'birth_date',
                ],
                ...(resource === 'contact'
                    ? {
                        chain: {
                            emails: ['Email', 'get', { where: [['contact_id', '=', '$id']] }],
                            phones: ['Phone', 'get', { where: [['contact_id', '=', '$id']] }],
                            addresses: ['Address', 'get', { where: [['contact_id', '=', '$id']] }],
                        },
                    }
                    : {}),
            });
            out.push({ json: (_h = (_g = res === null || res === void 0 ? void 0 : res.values) === null || _g === void 0 ? void 0 : _g[0]) !== null && _h !== void 0 ? _h : {} });
        }
        return [out];
    }
}
exports.CiviCrm = CiviCrm;
/* ============================================================================
   UTILS
============================================================================ */
function convertValue(val) {
    const t = String(val !== null && val !== void 0 ? val : '').trim();
    if (t === '')
        return '';
    if (t === 'true')
        return true;
    if (t === 'false')
        return false;
    if (/^-?\d+(\.\d+)?$/.test(t))
        return Number(t);
    try {
        const j = JSON.parse(t);
        if (typeof j === 'object')
            return j;
    }
    catch (error) {
        // Not valid JSON, return original value
    }
    return val;
}
function normalizeBirthDate(input) {
    if (!input)
        return input;
    let v = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        // Already in correct format
    }
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        const [d, m, y] = v.split('/');
        v = `${y}-${m}-${d}`;
    }
    else if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
        const [d, m, y] = v.split('-');
        v = `${y}-${m}-${d}`;
    }
    else if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) {
        v = v.replace(/\//g, '-');
    }
    else if (/^\d{4}\.\d{2}\.\d{2}$/.test(v)) {
        v = v.replace(/\./g, '-');
    }
    const dt = new Date(v);
    if (isNaN(dt.getTime()))
        throw new Error(`Invalid birth_date: ${input}`);
    return v;
}
exports.default = CiviCrm;
