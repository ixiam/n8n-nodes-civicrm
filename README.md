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

The node supports two authentication modes:

### **1. Standard API Key Authentication**
Simple and reliable for most use cases.

| Field | Description |
|-------|-------------|
| **Base URL** | Root URL of CiviCRM. Example: `https://crm.example.org` |
| **API Token** | Your API Key from CiviCRM (sent as `X-Civi-Auth: Bearer <token>`) |

### **2. JWT Authentication with Auto-Resolve (v3.0+)**
Time-bounded tokens for enhanced security. **Contact ID is automatically resolved** from your API Key.

| Field | Description |
|-------|-------------|
| **Base URL** | Root URL of CiviCRM |
| **API Token** | Your API Key (used to resolve Contact ID & generate JWT) |
| **Enable JWT Auth** | Toggle to enable time-bounded JWT tokens |
| **JWT Header Mode** | Where to send JWT (X-Civi-Auth recommended) |

#### How JWT Auto-Resolve Works

1. When making an API call, the node automatically:
   - Resolves your Contact ID from your API Key
   - Generates a time-bounded JWT token (1 hour default)
   - Caches both for efficiency

2. The JWT is used for API requests, with **automatic fallback to API Key** if:
   - JWT generation fails
   - JWT returns empty results
   - JWT expires

3. **Zero manual configuration** - Contact ID is detected automatically

#### JWT Setup Requirements

**CiviCRM Extensions & Settings:**
- ✓ AuthX extension enabled (CiviCRM 5.48+)
- ✓ API Key assigned to a Contact record

**CiviCRM Authentication Configuration**

The following settings must be enabled in CiviCRM's Authentication configuration:

```
Administer → System Settings → Authentication
├─ AuthX Header Authentication: ✓ ENABLED
├─ AuthX XHeader Support: ✓ ENABLED
├─ Credential Types: Include 'jwt'
└─ XHeader Name: Set to 'X-Civi-Auth' (default)
```

**Settings in civicrm.settings.php:**
```php
// Enable AuthX for JWT tokens
define('CIVICRM_AUTHX_XHEADER_CRED', json_encode(['jwt']));

// Optional: Configure JWT signing keys (auto-generated)
// define('CIVICRM_AUTHX_SIGN_KEY', 'your-signing-key');
```

**How to Enable:**
1. Go to **Administer → System Settings → Authentication**
2. Find **AuthX Settings** section
3. Check: `✓ Enable X-Header Authentication`
4. Check: `✓ JWT in X-Civi-Auth header`
5. Verify **Header name**: `X-Civi-Auth`
6. **Save** configuration

#### JWT Token Rotation & Security

**Token Lifetime & Auto-Refresh:**
- JWT tokens auto-expire after 1 hour (configurable in n8n credential)
- n8n automatically refreshes expired tokens (transparent to workflows)
- No manual intervention needed

**Security Best Practices:**

| Action | Frequency | Reason |
|--------|-----------|--------|
| **Rotate API Keys** | Every 90 days | Limits exposure window if compromised |
| **Review AuthX Logs** | Monthly | Detect unauthorized access attempts |
| **Monitor JWT Usage** | Real-time | Alert on unusual patterns |
| **Update CiviCRM** | As released | Includes security patches |
| **Audit n8n Workflows** | Quarterly | Verify only needed credentials used |

**When to Regenerate Credentials:**
- ✅ Regular security rotation (quarterly)
- ✅ Suspected credential compromise
- ✅ Staff member leaves organization
- ✅ n8n instance compromised
- ✅ Failed authentication attempts detected

**How to Revoke Access Immediately:**
```
Option 1: Disable JWT (n8n credential)
├─ Uncheck "Enable JWT Auth" toggle
└─ Node falls back to API Key (effective immediately)

Option 2: Regenerate API Key (CiviCRM)
├─ Go to Contact record
├─ Regenerate API Key field
└─ Old JWT & API Key become invalid instantly
```

**→ See [JWT_QUICKSTART.md](JWT_QUICKSTART.md) for 5-minute setup**  
**→ See [JWT_AUTORESOLVE_SETUP.md](JWT_AUTORESOLVE_SETUP.md) for detailed configuration**

---

After entering credentials, click **Test credentials** to validate the connection.

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

### **7. JWT Authentication with Auto-Resolve (v3.0+)**
Enhanced security with time-bounded tokens:

**Features:**
- ✨ **Automatic Contact ID Resolution** - No manual input needed
- ✨ **Time-Bounded Tokens** - 1 hour default (configurable)
- ✨ **Smart Fallback** - Automatically falls back to API Key if JWT insufficient
- ✨ **Efficient Caching** - Contact ID & JWT cached for performance
- ✨ **Zero Configuration** - Just enable "JWT Auth" toggle

**Example Workflow:**
```
Enable JWT in credential
    ↓
Make API call
    ↓
[Automatic]
├─ Resolve: Which Contact owns this API Key?
├─ Generate: Time-bounded JWT token
├─ Try: API call with JWT
└─ Fallback: If empty, retry with API Key
    ↓
Get results
```

**Security Benefits vs API Key Only:**
- ✓ Tokens expire automatically (1 hour)
- ✓ Leaked token has limited lifetime
- ✓ Can't be used outside CiviCRM
- ✓ Full audit trail available

→ **Learn more:** [JWT_AUTORESOLVE_SETUP.md](JWT_AUTORESOLVE_SETUP.md)

---

## Compatibility

- **n8n version:** 1.0.0 or higher  
- **Node.js:** 18 or higher  
- **CiviCRM:** API v4 compatible 

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
