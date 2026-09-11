export class SampleJobSource {
  constructor() {
    this.name = 'sample';
    this.type = 'sample';
  }

  async discover() {
    return [
      {
        source: 'sample',
        sourceJobId: 'sample-001',
        company: 'Microsoft',
        title: 'Software Engineer Intern',
        description: `
          Software engineering internship.
          Requirements: Python, C++, Data Structures,
          Algorithms, Azure and Git.
        `,
        location: 'Bangalore, India',
        employmentType: 'Internship',
        salary: '₹50,000/month',
        url: 'https://example.com/microsoft-intern',
        postedAt: new Date()
      },

      // more sample jobs...
    ];
  }
}