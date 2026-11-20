# n8n-nodes-civicrm

![n8n Community Node](https://img.shields.io/badge/n8n-Community%20Node-blue.svg)
![CiviCRM API v4](https://img.shields.io/badge/CiviCRM-API%20v4-orange.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)

Community Node for **CiviCRM API v4** (Civi-Go compatible)  
Developed and maintained by **Ixiam Global Solutions**.

This node integrates **n8n** with **CiviCRM API v4**: built-in operations for contacts, memberships, groups, relationships and activities, plus **Any Entity**, which discovers every entity and action the connected site offers. It authenticates with an API key or a username and password, on any AuthX route, optionally through short-lived JWTs.

---

## About CiviCRM

<p align="center">
  <img src="https://civicrm.org/sites/civicrm.org/files/CiviCRM-logo-2019-F2-200px.png" alt="CiviCRM Logo" width="200"/>
</p>

CiviCRM is an open-source Constituent Relationship Management platform designed for nonprofits, NGOs, and advocacy organizations. It supports contact management, memberships, contributions, event registration, email marketing, case management, and reporting. CiviCRM integrates with WordPress, Drupal, and Joomla.

Download: https://civicrm.org/download

---

## 🚀 Installation

1. In your n8n instance, go to:  
   **Settings → Community Nodes → Install**
2. Enter the package name:

```
@ixiam/n8n-nodes-civicrm
```

3. Approve installation and enable Community Nodes.
   To try a pre-release (e.g. 4.0.0-dev builds), enter `@ixiam/n8n-nodes-civicrm@next` instead.
4. If running n8n via Docker, restart/rebuild for the node to load.

---

## 🔐 Credentials

| Field | Description |
|-------|-------------|
| **Base URL** | Site root, e.g. `https://crm.example.org` (without `/civicrm`) |
| **Authentication Type** | **API Key** or **Username and Password** (CMS login) |
| **Send Credentials Via** | `X-Civi-Auth` header (recommended), `Authorization` header, or `_authx` request parameter |
| **Site Key** | Optional; sent as `X-Civi-Key` for sites that rely on AuthX's site-key guard |
| **Use Short-Lived JWT** | Optional; exchanges the credential for a JWT (`AuthxCredential.create`) and sends that instead |

Click **Test credential** to sign in exactly as the node will. The route you choose must accept your credential type in CiviCRM's AuthX settings (**Administer → System Settings → Authentication**).

**→ See [AUTHENTICATION.md](AUTHENTICATION.md)** for the CiviCRM settings and permissions each option needs, JWT sessions, the Runtime Bearer Token, Base URL Override and troubleshooting.

---

## 📦 Supported Entities

| Resource | Operations |
|--------|------------|
| **Contact** | Get, Get Many, Create, Update, Delete (with emails, phones and addresses) |
| **Membership** | Get, Get Many, Create, Update, Delete |
| **Group** | Get, Get Many, Create, Update, Delete |
| **Relationship** | Get, Get Many, Create, Update, Delete |
| **Activity** | Get, Get Many, Create, Update, Delete |
| **Any Entity** | Every entity and action the connected site offers, discovered at runtime (see below) |
| **Custom API Call** | Raw API Call, List Fields, Dynamic Search for any APIv4 entity |

---

## 🧩 Key Features

### **1. Any Entity (4.0+)**
In n8n's node picker, search **CiviCRM** and choose one of the **Any Entity** actions (or set *Resource* to **Any Entity** on an existing node). Then pick any entity the site offers, including those added by extensions (for example Sendgrid or SearchKit), from a dropdown:

- **Get Many**: choose the fields to return, filter (field, operator, value), sort, limit or return all.
- **Create / Update / Create or Update**: n8n's field mapper lists the entity's fields with their types and choice lists; values can be mapped automatically from the input.
- **Delete**: by record ID or by filters (never without one of them).
- **Other Action**: any other action the entity offers (e.g. Contact → Get Duplicates), with APIv4 params as JSON.

The lists come from CiviCRM (`Entity.get`, `getActions`, `getFields`) using the node's credential, so they show exactly what that credential may use; they are cached for 15 minutes. Actions that change data in bulk (replace, mergeDuplicates, revert, …) and administrative entities (System, Setting, …) appear only with **Show Advanced Entities and Actions**, and the same rule is enforced when the workflow runs.

### **2. Dynamic Field Mapping (built-in entities)**
Supports any standard or custom field:

```
first_name = John
last_name = Doe
custom_45 = Blue
```

### **3. Smart Email, Phone & Address Mapping (Contact)**
Two ways to set location-aware fields:

**(A) Simple fields**
```
email = test@example.org
phone = 600123456
phone.phone_type_id = 2
address.city = Barcelona
```

**(B) Prefixes matched to the site's Location Types**
```
work.email = user@company.org
billing.address.postal_code = 80331
home.phone.phone_type_id = 2
```

### **4. Default Location Type selectors**
If no prefix is used, the selected default types apply (Home, Work, Main, Billing, Other).

### **5. Birth Date Normalization**
Accepted input formats: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`, `YYYY.MM.DD`; stored as `YYYY-MM-DD`.

### **6. Get Many with JSON Filters**
```json
[
  ["first_name", "LIKE", "Ju%"],
  ["birth_date", ">", "1990-01-01"],
  ["gender_id", "IN", [1, 2]]
]
```

### **7. Custom API Call**
Set **Entity** (e.g. `Contribution`), **Action** (e.g. `get`) and **Params (JSON)**:
```json
{ "select": ["id", "total_amount"], "where": [["contribution_status_id:name", "=", "Completed"]], "limit": 10 }
```

### **8. Paging that respects the site**
Return All fetches pages of 500 and drops to 100 automatically on sites that cap rows per call.

### **9. HTTP Request node**
The **CiviCRM API** credential also works in n8n's HTTP Request node (*Authentication → Predefined Credential Type → CiviCRM API*), with the same type, route and site key. With the `_authx` route, send a form-urlencoded body so the credential is not put in the URL.

---

### **10. Errors a workflow can branch on**
With **Continue On Fail**, a failed CiviCRM call returns `error` (the message) and `civicrm_error`:

| Field | Content |
|---|---|
| `kind` | `permission_denied` (403), `auth_rejected` (401 and AuthX refusals), `rate_limited` (429), `unavailable` (502, 503, 504, network errors) or `civicrm_error` (anything else) |
| `http_code` | HTTP status of CiviCRM's answer, as a string |
| `error_message`, `error_code`, `status` | CiviCRM's APIv4 error fields |
| `error_id` | Reference to look the error up in CiviCRM's log, when CiviCRM hides the detail from the user |
| `db_error`, `body` | Short database error label, or a text excerpt of a non-JSON answer |

Branch on `kind` or `http_code` instead of the message text, which may be reworded between versions. The detail is sanitized: no request headers, credentials, SQL or backtraces, and every text is length-capped. When the node stops instead, the same object is in the error's `context.civicrm`.

## Compatibility

- **n8n:** tested with 2.41; requires n8n 1.0 or higher
- **Node.js:** 18 or higher
- **CiviCRM:** APIv4 with the AuthX extension (tested with CiviCRM 6.4)

Upgrading from 3.x? See the breaking changes in [CHANGELOG.md](CHANGELOG.md); credentials saved with 3.x keep working.

---

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for the Docker development stack, tests (unit, live integration and n8n end-to-end) and the release process.

---

## Contributions

Pull requests and issues are welcome in the GitHub repository.

---

## 🧑‍💻 About Ixiam Global Solutions

Website: **https://www.ixiam.com**  
Contact: **info@ixiam.com**

---

## 📄 License

MIT License
