const MPProject = require('../MP/Project.js');
const MPTextReconstructor = require('../MP/TextReconstructor.js');

test('optimize call on long history entries', async () => {
  const projectData = require('./histories/TextOperations/LongHistory.json');
  let project = new MPProject(
    projectData.name,
    projectData.authState,
    projectData.metadata,
    null,
    projectData.files,
    {},
    {},
    {},
    projectData.inactiveUsers
  );
  let pathname = 'functions/__main__.js';
  let file = project.fileSystem.open(pathname);
  let textReconstructor = new MPTextReconstructor();
  let originalValue = textReconstructor.reconstruct(project, file).value;
  file.textOperations.optimize();
  let optimizedValue = textReconstructor.reconstruct(project, file).value;
  expect(optimizedValue).toBe(originalValue);
});

