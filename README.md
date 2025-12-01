# n8n-nodes-civicrm

![n8n Community Node](https://img.shields.io/badge/n8n-Community%20Node-blue.svg)
![CiviCRM API v4](https://img.shields.io/badge/CiviCRM-API%20v4-orange.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)

Community Node for **CiviCRM API v4** (Civi-Go compatible)  
Developed and maintained by **Ixiam Global Solutions**.

This node enables full integration between **n8n** and **CiviCRM API v4**, supporting create/update/delete operations, smart field mapping, dynamic location types, and advanced filtering on GET operations.

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
4. If running n8n via Docker, restart/rebuild for the node to load.

---

## 🔐 Credentials

The node uses **Bearer Token Authentication**.

| Field | Description |
|-------|-------------|
| **Base URL** | The root URL of your CiviCRM instance (without trailing slash). Example: `https://crm.example.org` |
| **API Token** | Sent as header `X-Civi-Auth: Bearer <token>` |

After entering credentials, click **Save** to validate the connection.

---

## 📦 Supported Entities

The node includes full API v4 support for the following entities:

| Entity | Operations |
|--------|------------|
| **Contact** | get, getMany, create, update, delete |
| **Membership** | get, getMany, create, update, delete |
| **Group** | get, getMany, create, update, delete |
| **Relationship** | get, getMany, create, update, delete |
| **Activity** | get, getMany, create, update, delete |
| **Custom API Call** | full custom API4 request |

---

## 🧩 Key Features

### **1. Dynamic Field Mapping**
Supports any standard or custom field:

```
first_name = John
last_name = Doe
custom_45 = Blue
```

### **2. Smart Email, Phone & Address Mapping**
Two ways to set location-aware fields:

**(A) Simple fields**
```
email = test@example.org
phone.mobile = 600123456
address.city = Barcelona
```

**(B) Dynamic prefixes matched to CiviCRM Location Types**
```
work.email = user@company.org
billing.address.postal_code = 80331
home.phone.phone_type_id = 2
```

### **3. Default Location Type selectors**
If no prefix is used, default types are applied.

### **4. Birth Date Normalization**
Accepted input formats:

- YYYY-MM-DD
- DD/MM/YYYY
- DD-MM-YYYY
- YYYY/MM/DD
- YYYY.MM.DD

Auto-normalized to `YYYY-MM-DD`.

### **5. GET MANY with JSON Filters**
Example:
```json
[
  ["first_name", "LIKE", "Ju%"],
  ["birth_date", ">", "1990-01-01"],
  ["gender_id", "IN", [1, 2]]
]
```

### **6. Custom API Call Mode**
Example:
```json
{
  "entity": "Contact",
  "action": "get",
  "params": { "limit": 10 }
}
```

---

## Compatibility

- **n8n version:** 1.0.0 or higher  
- **Node.js:** 18 or higher  
- **CiviCRM:** API v4 compatible (including Civi-Go)

---

## Development

Clone the repository and run:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

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
