Setup Instructions:
Go to folder Recura and type 'npm run dev' to start and run program.

copypasta:
npm run dev

need to know login information (select profiles):
`user:password`
`patient:patient123`
`manager:manager123`

Tradeoffs:
For the appointment automation and scheduler I opted for availability and partition, where I used Cassandra for the database and a load balancer (currently a stub).

For the medical supply equipment manager I opted for also availability and partition, implementing a CDN (currently a stub) and leader election to make sure the database was up to date per location.

For the lunch selection for employees I opted for queues, elastic search, high consistency and partition because real life food never waits and grocery stores and food trends change as markets evolve.


Stubs / Unhandled Edge Cases (what's known incomplete):
CDN, load balancers, cloud implementations (currently mostly local, except for anthropic AI or SI usage)


Key decisions:
I started out the project with core entities in mind, targeting my user use cases, based on (you) the project reviewer, (hello!), recura's core business and doctors. I went through all the functional and possible non functional requirements for the project after I decided what theme of microservices I wanted to implement. I touched up on the homepage and UI/UX, until where, I decided this was a good route forward. Then revisited the instructions to get a better understanding of core functionalities. This was a good spot, because the necessary automations had a base, my API gateway and AI gateways. This is how I can have all the necessary variables for automations, and define the automation logic loops. Implemented three customizable triggers as follows:

1) doctor running late, I checked in, rescheduled --> Claude notifies patient and doctor
2) supply runs low, equipment needs sterilizing --> Claude notifies doctor and orders more stock
3) meal skipped, plan over budget --> Ask Claude to notify, re-plan meal tomorrow

The automations are managed through events and organized in the event bus. Nothing is planned without the owner's pick. Overall, I created necessary demo screens, wrote detailed requirements on paper, fixed up UI/UX, ran End-to-end regression tests, and then organized the code so we could reuse necessary components. ~some accounting details omitted for simplicity and included marketing theory.


Authored By:
Gordon N. 10/31/26