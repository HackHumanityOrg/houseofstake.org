import React from 'react';
import Head from '@docusaurus/Head';
import Hero from '../components/homepage/Hero';
import What from '../components/homepage/What';
import How from '../components/homepage/How';
import StructureRoles from '../components/homepage/StructureRoles';
import GovernanceSystem from '../components/homepage/GovernanceSystem';
import GetInvolved from '../components/homepage/GetInvolved';
import FindUs from '../components/homepage/FindUs';
import Footer from '../components/homepage/Footer';
import styles from './index.module.css';

export default function Home(): React.JSX.Element {
  return (
    <>
      <Head>
        <title>House of Stake - Governance of The NEAR Ecosystem</title>
        <meta
          name="description"
          content="House of Stake is NEAR's governance platform. Lock NEAR to receive veNEAR and participate in ecosystem decisions."
        />
      </Head>
      <div className={styles.homepage}>
        <Hero />
        <What />
        <How />
        <StructureRoles />
        <GovernanceSystem />
        <GetInvolved />
        <FindUs />
        <Footer />
      </div>
    </>
  );
}
