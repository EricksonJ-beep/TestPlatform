/**
 * bloom/require-authz
 *
 * Every exported function in a "use server" module, and every HTTP method
 * export in an app/**\/route.ts file, must call an authorization guard from
 * src/lib/authz.ts somewhere in its body, or be explicitly wrapped in
 * publicRoute(). This is the "can't be forgotten" backstop from Ticket 0.5.
 */

const GUARDS = new Set([
  "requireSession",
  "requireTeacher",
  "requireStudent",
  "requireOwner",
  "requireShared",
  "requireEnrolled",
  "requireAssignmentAccess",
  "requireAttemptAccess",
]);
const ROUTE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const SKIP_KEYS = new Set(["parent", "loc", "range", "tokens", "comments"]);

function calleeName(call) {
  const c = call.callee;
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression" && c.property.type === "Identifier") return c.property.name;
  return null;
}

function containsCall(root, predicate) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (node.type === "CallExpression" && predicate(node)) return true;
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const value = node[key];
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value.type === "string") stack.push(value);
    }
  }
  return false;
}

const hasGuard = (node) => containsCall(node, (c) => GUARDS.has(calleeName(c) ?? ""));
const isPublic = (node) =>
  node && node.type === "CallExpression" && calleeName(node) === "publicRoute";

const requireAuthz = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Server actions and route handlers must call an authorization guard (or be wrapped in publicRoute).",
    },
    schema: [],
    messages: {
      missing:
        "`{{name}}` touches the server without an authorization guard. Call requireTeacher()/requireOwner()/requireStudent()/... first, or wrap an intentionally public handler in publicRoute().",
    },
  },
  create(context) {
    const filename = context.filename.replace(/\\/g, "/");
    const program = context.sourceCode.ast;
    const isServerModule = program.body.some(
      (s) => s.type === "ExpressionStatement" && s.directive === "use server"
    );
    const isRouteFile = /\/app\/.*\/route\.(ts|tsx|js|jsx)$/.test(filename);
    if (!isServerModule && !isRouteFile) return {};

    function check(name, node) {
      if (isRouteFile && !isServerModule && !ROUTE_METHODS.has(name)) return;
      if (isPublic(node) || hasGuard(node)) return;
      context.report({ node, messageId: "missing", data: { name } });
    }

    return {
      ExportNamedDeclaration(node) {
        const d = node.declaration;
        if (!d) return;
        if (d.type === "FunctionDeclaration") {
          check(d.id ? d.id.name : "function", d);
        } else if (d.type === "VariableDeclaration") {
          for (const decl of d.declarations) {
            if (decl.id.type === "Identifier" && decl.init) check(decl.id.name, decl.init);
          }
        }
      },
      ExportDefaultDeclaration(node) {
        const d = node.declaration;
        if (d.type === "FunctionDeclaration" || d.type === "ArrowFunctionExpression") {
          check("default", d);
        }
      },
    };
  },
};

export default requireAuthz;
