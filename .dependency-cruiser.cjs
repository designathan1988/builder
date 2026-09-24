/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [],
  options: {
    // Only the project's own code is analysed: never the reference projects, the Pager copy or the browser tool's scratch files.
    exclude: { path: '^(reference|\\.cache|\\.playwright-mcp)/' },
    doNotFollow: { path: 'node_modules' },
  },
};
