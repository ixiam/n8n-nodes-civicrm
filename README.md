# n8n-nodes-civicrm
Community Node for **CiviCRM API v4** (Civi-Go compatible)  
Developed and maintained by **Ixiam Global Solutions**.

This node enables full integration between **n8n** and **CiviCRM API v4**, supporting create/update/delete operations, smart field mapping, dynamic location types, and advanced filtering on GET operations.

## 🚀 Installation

1. In your n8n instance, go to:  
   **Settings → Community Nodes → Install**
2. Enter the package name:

```
n8n-nodes-civicrm
```

3. Approve installation and enable Community Nodes.

## 🔐 Credentials

The node uses **Bearer Token Authentication**.

| Field | Description |
|-------|-------------|
| **Base URL** | The root URL of your CiviCRM instance (without trailing slash). Example: `https://crm.example.org` |
| **API Token** | Sent as header `X-Civi-Auth: Bearer <token>` |

After entering credentials, click **Save** to validate the connection.

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
```
[
  ["first_name", "LIKE", "Ju%"],
  ["birth_date", ">", "1990-01-01"],
  ["gender_id", "IN", [1, 2]]
]
```

### **6. Custom API Call Mode**
```
{
  "entity": "Contact",
  "action": "get",
  "params": { "limit": 10 }
}
```

## 🧑‍💻 About Ixiam Global Solutions

Website: **https://www.ixiam.com**  
Contact: **info@ixiam.com**

## 📄 License

MIT License
