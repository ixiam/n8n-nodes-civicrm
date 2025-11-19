import { CiviCrm } from "../../dist/nodes/CiviCrm/CiviCrm.node";
import type { IExecuteFunctions, INodeExecutionData } from "n8n-workflow";

/**
 * Minimal mock context required by n8n for community node validation.
 */
function mockExecuteContext(items: any[]): IExecuteFunctions {
	return {
		// Mock de parámetros del nodo
		getNodeParameter: jest.fn((name: string, _index: number, fallback: any) => {
			const params: Record<string, any> = {
				resource: "contact",
				operation: "getMany",
				returnAll: true,
				whereJson: "[]",
			};
			return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback;
		}) as any,

		// Mock de credenciales
		getCredentials: jest.fn(async () => ({
			baseUrl: "https://mock",
			apiToken: "123",
		})) as any,

		// Mock de llamadas HTTP (API4)
		helpers: {
			httpRequest: jest.fn(async () => ({
				values: [{ id: 1 }],
			})),
		},

		// Items de entrada
		getInputData: jest.fn(() => items),

		continueOnFail: jest.fn(() => false),
		getExecutionId: () => "1",
	} as unknown as IExecuteFunctions;
}

describe("CiviCRM Node (n8n validation tests)", () => {
	test("Node loads metadata", () => {
		const node = new CiviCrm();

		expect(node.description).toBeDefined();
		expect(node.description.displayName).toBe("CiviCRM");
		expect(Array.isArray(node.description.properties)).toBe(true);
	});

	test("Node executes minimal GET MANY", async () => {
		const node = new CiviCrm();

		const ctx = mockExecuteContext([{ json: {} }]);

		const result = await node.execute.call(ctx);

		// result es INodeExecutionData[][]
		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
		expect(Array.isArray(result[0])).toBe(true);

		const firstItem = result[0][0] as INodeExecutionData;

		expect(firstItem.json).toBeDefined();
		expect(firstItem.json.id).toBe(1);
	});
});
