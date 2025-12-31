# n8n-nodes-civigo

This is an n8n community node. It lets you use CiviCRM in your n8n workflows.

[n8n](https://n8n.io/) is a fair-code licensed workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/creating-nodes/test/run-node-locally/) in the n8n documentation.

## Operations

### Contact
* Create
* Get
* Get Many
* Update

### Generic
* Perform any CiviCRM API v4 action by specifying Entity, Action and Parameters.

## Credentials

### CiviCRM API
* **URL**: The base URL of your CiviCRM instance (e.g. `https://example.org`).
* **Site Key**: Defined in `civicrm.settings.php`.
* **API Key**: The API key of the user.

## Compatibility
tested with n8n v0.200+ and CiviCRM 5.x.
